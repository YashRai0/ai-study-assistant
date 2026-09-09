import Pdf from "../models/Pdf.js";
import Concept from "../models/Concept.js";
import Course from "../models/Course.js";
import DiagnosticQuestion from "../models/DiagnosticQuestion.js";
import MisconceptionPattern from "../models/MisconceptionPattern.js";
import Chunk from "../models/Chunk.js";
import Source from "../models/Source.js";
import { extractConcepts, generateDiagnosticQuestions } from "./llm.js";
import { isValidLevel } from "./cognitiveLevel.js";
import { rankEvidenceChunks } from "./evidenceRanking.js";
import { normalizeDomain } from "./misconceptionDetection.js";
import logger from "../utils/logger.js";

function normalizeName(name) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Finds which PDFs actually mention a concept (by name or alias), so
 * Concept.sourceRefs can record real "this concept came from these
 * sources" evidence instead of concepts being merged across PDFs with no
 * record of which source(s) actually support each one.
 *
 * Deliberately a cheap substring match over each PDF's already-extracted
 * fullText rather than a second LLM call per concept — this runs once per
 * concept per learning-pipeline pass, so an LLM call here would multiply
 * cost by roughly the concept count for marginal benefit over "does the
 * source text actually contain this term".
 *
 * Pure function (no DB access — pdfs are passed in already-fetched) so
 * it's independently testable.
 */
export function findSourceReferences(conceptName, aliases, pdfs) {
  const needles = [conceptName, ...(aliases || [])].map(normalizeName).filter(Boolean);
  if (!needles.length) return [];

  return pdfs
    .filter((pdf) => {
      const haystack = normalizeName(pdf.fullText || "");
      return needles.some((needle) => haystack.includes(needle));
    })
    .map((pdf) => ({ sourceId: pdf._id, page: null, chunkId: null }));
}

// The relationship fields extractConcepts() asks the LLM for, each an array
// of concept names to resolve into ObjectIds once every concept exists.
const RELATIONSHIP_FIELDS = [
  "prerequisites",
  "relatedConcepts",
  "dependsOn",
  "supports",
  "contrastsWith",
  "commonlyConfusedWith",
];

/**
 * Resolves one concept's relationship name-lists (from the LLM's raw
 * extraction) into ObjectIds, using the name -> concept-doc map built
 * during the upsert pass. Skips names that don't match any known concept
 * (the LLM may reference a concept it decided not to extract) and drops a
 * self-reference (a concept can't be its own prerequisite/etc.).
 *
 * Pulled out as its own pure function — no DB access — so the resolution
 * logic itself is unit-testable without a live Mongo connection or LLM
 * call, unlike the rest of buildCourseLearningModel().
 */
export function resolveConceptRelationships(item, conceptsByName, conceptId) {
  const resolved = {};
  for (const field of RELATIONSHIP_FIELDS) {
    const names = Array.isArray(item[field]) ? item[field] : [];
    resolved[field] = names
      .map((name) => conceptsByName.get(normalizeName(name))?._id)
      .filter((id) => id && String(id) !== String(conceptId));
  }
  return resolved;
}

/**
 * Drops edges from a candidate prerequisite graph that would create a
 * cycle, processing concepts in the order given and — within a concept —
 * keeping earlier-listed prerequisites over later ones that would close a
 * loop back. `edgesByConceptId` is a Map<conceptIdString, Set<conceptIdString>>
 * meaning "concept requires each of these as a prerequisite".
 *
 * The LLM has no structural guarantee of producing a DAG: "A prerequisite
 * B" and "B prerequisite A" can both come out of extraction over long or
 * messy source material, especially across multiple PDF uploads to the
 * same course. An undetected cycle here doesn't just look wrong in the
 * UI — nextAction.js's prerequisite-gap logic walks this graph, and a
 * loop in it can make that walk never terminate or never resolve which
 * concept to recommend next.
 *
 * Pure function (no DB access) so it's independently testable, same as
 * resolveConceptRelationships above.
 */
export function removeCyclicPrerequisiteEdges(edgesByConceptId) {
  const kept = new Map();
  for (const conceptId of edgesByConceptId.keys()) kept.set(conceptId, new Set());
  const dropped = [];

  function reaches(fromId, toId, visited = new Set()) {
    if (fromId === toId) return true;
    if (visited.has(fromId)) return false;
    visited.add(fromId);
    for (const next of kept.get(fromId) || []) {
      if (reaches(next, toId, visited)) return true;
    }
    return false;
  }

  for (const [conceptId, prereqIds] of edgesByConceptId) {
    for (const prereqId of prereqIds) {
      // Edge means "conceptId requires prereqId" (prereqId comes first).
      // That closes a cycle exactly when the target (prereqId) can
      // already reach back to conceptId in the graph built so far — i.e.
      // conceptId is already, indirectly, a prerequisite of prereqId.
      // Adding conceptId -> prereqId on top of that would close the loop.
      if (reaches(prereqId, conceptId)) {
        dropped.push({ concept: conceptId, prerequisite: prereqId });
        continue;
      }
      kept.get(conceptId).add(prereqId);
    }
  }
  return { kept, dropped };
}

export async function buildCourseLearningModel({ courseId, sourcePdfId = null }) {
  const pdfs = await Pdf.find({ course: courseId, processingStatus: "ready" })
    .select("_id fullText filename")
    .lean();
  if (!pdfs.length) throw new Error("No ready study material exists for this course");

  const sourcePdf = sourcePdfId ? pdfs.find((p) => String(p._id) === String(sourcePdfId)) : pdfs[0];
  const text = pdfs.map((p) => `SOURCE: ${p.filename}\n${p.fullText}`).join("\n\n--- SOURCE ---\n\n");

  const extracted = await extractConcepts(text, { maxConcepts: 40 });
  const conceptsByName = new Map();

  // Upsert by normalized name in application code so repeated PDF ingestion does
  // not create duplicate concepts merely because capitalization differs.
  for (const item of extracted) {
    const name = String(item.name || "").trim();
    if (!name) continue;
    const key = normalizeName(name);
    if (conceptsByName.has(key)) continue;

    const aliases = Array.isArray(item.aliases) ? item.aliases.slice(0, 20) : [];
    const sourceRefs = findSourceReferences(name, aliases, pdfs);

    const doc = await Concept.findOneAndUpdate(
      { course: courseId, name },
      {
        $set: {
          description: String(item.description || "").slice(0, 5000),
          importance: Math.max(0, Math.min(1, Number(item.importance) || 0.5)),
          difficulty: Math.max(1, Math.min(5, Number(item.difficulty) || 3)),
          aliases,
          sourceRefs,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    conceptsByName.set(key, doc);
  }

  // Resolve relationship names only after all concepts exist.
  //
  // prerequisites is graphed and cycle-checked separately from the other
  // relationship fields (relatedConcepts/supports/contrastsWith/
  // commonlyConfusedWith aren't meant to be acyclic — "A contrasts with B"
  // has no direction to loop). The candidate graph starts from every
  // concept already in the course (not just this batch), since
  // prerequisite edges accumulate across multiple PDF uploads and a cycle
  // can just as easily span an old edge and a new one.
  const allCourseConcepts = await Concept.find({ course: courseId }).select("_id prerequisites").lean();
  const edgesByConceptId = new Map(
    allCourseConcepts.map((c) => [String(c._id), new Set((c.prerequisites || []).map(String))])
  );

  const relationshipsByConceptId = new Map();
  for (const item of extracted) {
    const concept = conceptsByName.get(normalizeName(item.name));
    if (!concept) continue;
    const relationships = resolveConceptRelationships(item, conceptsByName, concept._id);
    relationshipsByConceptId.set(String(concept._id), relationships);
    edgesByConceptId.set(String(concept._id), new Set(relationships.prerequisites.map(String)));
  }

  const { kept, dropped } = removeCyclicPrerequisiteEdges(edgesByConceptId);
  if (dropped.length) {
    logger.warn({ courseId, dropped }, "Dropped cyclic prerequisite edges during concept extraction");
  }

  for (const [conceptId, relationships] of relationshipsByConceptId) {
    await Concept.findByIdAndUpdate(conceptId, {
      $set: { ...relationships, prerequisites: Array.from(kept.get(conceptId) || []) },
    });
  }

  const concepts = await Concept.find({ course: courseId }).select("_id name aliases description difficulty").lean();

  const course = await Course.findById(courseId).select("subject").lean();
  const domain = normalizeDomain(course?.subject);
  const misconceptionPatterns = domain
    ? await MisconceptionPattern.find({ domain, active: true }).select("pattern description keywords").lean()
    : [];

  const questions = await generateDiagnosticQuestions(text, concepts, {
    count: Math.min(10, Math.max(5, concepts.length)),
    misconceptionPatterns,
  });

  // Fetched once for the whole course rather than per-question: gives
  // each generated question real educational provenance (see
  // evidenceRanking.js) — "this question is grounded in these source
  // chunks" — instead of only ever tracing back to sourcePdf as a whole
  // document. rankEvidenceChunks is a pure lexical-overlap scorer (no LLM
  // call), so this is cheap even across a full course's chunks.
  const pdfIds = pdfs.map((p) => p._id);
  const [courseChunks, sources] = await Promise.all([
    Chunk.find({ pdf: { $in: pdfIds } }).select("_id page text pdf").lean(),
    Source.find({ pdf: { $in: pdfIds } }).select("_id pdf").lean(),
  ]);
  const sourceIdByPdfId = new Map(sources.map((s) => [String(s.pdf), s._id]));

  let createdQuestions = 0;
  for (const q of questions) {
    const concept = concepts.find((c) => normalizeName(c.name) === normalizeName(q.concept));
    if (!concept || !q.question || !q.answer) continue;
    const type = q.type === "mcq" ? "mcq" : "short_answer";
    const options = type === "mcq" && Array.isArray(q.options) ? q.options.slice(0, 4) : [];
    if (type === "mcq" && options.length < 2) continue;

    const evidenceRefs = rankEvidenceChunks({ conceptName: concept.name, aliases: concept.aliases, chunks: courseChunks, limit: 5 })
      .map(({ chunk }) => ({ sourceId: sourceIdByPdfId.get(String(chunk.pdf)) || null, page: chunk.page, chunkId: chunk._id }));

    // Matched by exact pattern name against the bank we actually sent the
    // model, rather than trusting whatever it returned — see
    // generateDiagnosticQuestions' comment. Tags come from the pattern's
    // own `keywords` when it has any; about half the seeded patterns don't
    // (some only carry a `regex`), so this falls back to the pattern's own
    // short name as a single tag rather than silently producing an empty
    // tag list — questionIntelligence.js's substring match still works
    // against that, just more coarsely than a curated keyword list would.
    const matchedPattern = q.targetsMisconceptionPattern
      ? misconceptionPatterns.find((p) => p.pattern.trim().toLowerCase() === String(q.targetsMisconceptionPattern).trim().toLowerCase())
      : null;
    const targetsMisconception = Boolean(matchedPattern);
    const misconceptionTags = matchedPattern
      ? (matchedPattern.keywords?.length ? matchedPattern.keywords : [matchedPattern.pattern])
      : [];

    await DiagnosticQuestion.findOneAndUpdate(
      { course: courseId, question: String(q.question).trim() },
      {
        $set: {
          conceptIds: [concept._id],
          type,
          options,
          answer: String(q.answer).trim(),
          explanation: String(q.explanation || "").trim(),
          difficulty: Math.max(1, Math.min(5, Number(q.difficulty) || concept.difficulty || 3)),
          cognitiveLevel: isValidLevel(q.cognitiveLevel) ? q.cognitiveLevel : "recall",
          sourcePdf: sourcePdf?._id || null,
          evidenceRefs,
          misconceptionTags,
          targetsMisconception,
          active: true,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    createdQuestions += 1;
  }

  return { conceptsCreatedOrUpdated: concepts.length, diagnosticQuestionsCreatedOrUpdated: createdQuestions };
}

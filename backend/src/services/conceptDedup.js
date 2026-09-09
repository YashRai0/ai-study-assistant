import mongoose from "mongoose";
import Concept from "../models/Concept.js";
import StudentConcept from "../models/StudentConcept.js";
import DiagnosticQuestion from "../models/DiagnosticQuestion.js";
import { cosineSimilarity } from "./vectorStore.js";

// DBSCAN-lite: cluster embeddings by similarity threshold
function clusterByEmbedding(concepts, threshold = 0.85) {
  const clusters = [];
  const visited = new Set();

  for (let i = 0; i < concepts.length; i++) {
    if (visited.has(i)) continue;
    const cluster = [concepts[i]];
    visited.add(i);

    for (let j = i + 1; j < concepts.length; j++) {
      if (visited.has(j)) continue;
      const sim = cosineSimilarity(concepts[i].embedding, concepts[j].embedding);
      if (sim >= threshold) {
        cluster.push(concepts[j]);
        visited.add(j);
      }
    }

    if (cluster.length > 1) clusters.push(cluster);
  }

  return clusters;
}

/**
 * Merges exact-name-duplicate concepts within a course (e.g. two concepts
 * both extracted as "Krebs Cycle" from different PDFs), keeping the oldest
 * and folding the rest into it.
 *
 * StudentConcept is keyed by {user, course, concept} — every merge below
 * happens per-user, not globally. An earlier version of this used a single
 * `findOne({concept: keep._id})` with no user filter, which would grab one
 * arbitrary user's mastery record and blend every other user's duplicate-
 * concept data into it — silent cross-user data corruption. Also
 * remaps DiagnosticQuestion.conceptIds from the merged-away concept to the
 * kept one, since deleting a concept without that remap would orphan any
 * question that referenced it (findQuestionForConcept would just never
 * find it again).
 *
 * Does not remap Attempt/Misconception documents that reference the merged
 * concept — those keep pointing at a deleted concept id. They still carry
 * correct evidence for the mastery numbers already folded in above; only
 * a later report that tries to display "which concept was this attempt
 * about" for one of those older records would need to handle a dangling
 * reference. Worth revisiting if that becomes a real use case.
 */
export async function deduplicateConceptsInCourse(courseId) {
  const concepts = await Concept.find({ course: courseId }).lean();
  if (concepts.length < 2) return { conceptCount: concepts.length, merged: 0 };

  const groups = new Map();
  for (const c of concepts) {
    const key = c.name.toLowerCase().trim();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }

  let merged = 0;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      for (const [, group] of groups) {
        if (group.length <= 1) continue;

        const keep = group[0];
        const toMerge = group.slice(1);
        const toMergeIds = toMerge.map((c) => c._id);
        merged += toMerge.length;

        // Fold each merged concept's per-user mastery into the kept
        // concept's per-user record (creating one if the user never had
        // an attempt on `keep` specifically).
        const dupStates = await StudentConcept.find({ concept: { $in: toMergeIds } }).session(session).lean();
        for (const ds of dupStates) {
          const keepState = await StudentConcept.findOne({ user: ds.user, course: courseId, concept: keep._id }).session(session);
          if (keepState) {
            const totalAttempts = (keepState.attempts || 0) + (ds.attempts || 0);
            keepState.mastery = totalAttempts > 0
              ? ((keepState.mastery || 0) * (keepState.attempts || 0) + (ds.mastery || 0) * (ds.attempts || 0)) / totalAttempts
              : (keepState.mastery || 0);
            keepState.attempts = totalAttempts;
            keepState.correct = (keepState.correct || 0) + (ds.correct || 0);
            keepState.incorrect = (keepState.incorrect || 0) + (ds.incorrect || 0);
            if (ds.lastReviewedAt && (!keepState.lastReviewedAt || ds.lastReviewedAt > keepState.lastReviewedAt)) {
              keepState.lastReviewedAt = ds.lastReviewedAt;
            }
            await keepState.save({ session });
          } else {
            await StudentConcept.create([{ ...ds, _id: undefined, course: courseId, concept: keep._id }], { session });
          }
        }

        // Point any question still referencing a merged-away concept at
        // the kept one instead, so it stays reachable. Two separate calls:
        // Mongo rejects $addToSet and $pull on the same field in one update.
        await DiagnosticQuestion.updateMany(
          { conceptIds: { $in: toMergeIds } },
          { $addToSet: { conceptIds: keep._id } },
          { session }
        );
        await DiagnosticQuestion.updateMany(
          { conceptIds: { $in: toMergeIds } },
          { $pull: { conceptIds: { $in: toMergeIds } } },
          { session }
        );

        await StudentConcept.deleteMany({ concept: { $in: toMergeIds } }).session(session);
        await Concept.deleteMany({ _id: { $in: toMergeIds } }).session(session);
      }
    });
  } finally {
    await session.endSession();
  }

  return { before: concepts.length, after: concepts.length - merged, merged };
}

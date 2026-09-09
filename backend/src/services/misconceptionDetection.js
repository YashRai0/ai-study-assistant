import MisconceptionPattern from "../models/MisconceptionPattern.js";
import Misconception from "../models/Misconception.js";

const KNOWN_DOMAINS = ["biology", "chemistry", "physics", "math", "english"];

/**
 * Maps a free-text Course.subject (e.g. "AP Biology", "Organic Chemistry
 * II", "General") to one of MisconceptionPattern's strict domain enum
 * values, or null when nothing matches — a course whose subject doesn't
 * map to a known pattern domain just gets zero pattern-match signal
 * (assessMisconceptionRisk still works fine from the LLM signal alone).
 * Pure function, no DB access, so it's independently testable.
 */
export function normalizeDomain(subject) {
  const lower = String(subject || "").toLowerCase();
  return KNOWN_DOMAINS.find((d) => lower.includes(d)) || null;
}

/**
 * Normalizes a misconception description into a stable key for matching
 * "is this the same misconception as last time" against, since two
 * descriptions of the same underlying error rarely come out
 * character-identical (the LLM phrases it fresh each time). Deliberately
 * coarse (lowercase, strip punctuation, collapse whitespace) rather than
 * semantic — good enough to stop two genuinely different misconceptions
 * on the same concept from being merged into one occurrence count, without
 * needing an embedding call just to dedupe a short label. Pure function,
 * no DB access, so it's independently testable.
 */
export function misconceptionKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 300);
}

export async function detectMisconception(answer, domain = "biology") {
  if (!answer || typeof answer !== "string") return null;

  const patterns = await MisconceptionPattern.find({
    domain,
    active: true,
  }).lean();

  for (const p of patterns) {
    if (p.regex) {
      try {
        const re = new RegExp(p.regex, "i");
        if (re.test(answer)) {
          return { pattern: p.pattern, description: p.description, severity: p.severity };
        }
      } catch (e) {
        // invalid regex, skip
      }
    }

    if (p.keywords?.length) {
      const answerLower = answer.toLowerCase();
      for (const kw of p.keywords) {
        if (answerLower.includes(kw.toLowerCase())) {
          return {
            pattern: p.pattern,
            description: p.description,
            severity: p.severity,
          };
        }
      }
    }
  }

  return null;
}

const SEVERITY_WEIGHT = { high: 1, medium: 0.7, low: 0.4 };

/**
 * Combines three independent signals into a single misconception risk
 * score (0–1), instead of trusting a lone LLM severity label:
 *
 *  - llmSeverity: the LLM's one-shot judgment on THIS answer alone
 *  - patternMatched: whether the deterministic MisconceptionPattern
 *    safety net (detectMisconception) independently flagged the same
 *    kind of error — corroborating evidence from a source that can't
 *    hallucinate a misconception that isn't textually there
 *  - priorOccurrences: how many times this exact misconception has
 *    already been recorded, unresolved, for this student on this concept
 *    — a recurring error is stronger evidence of a real mental model
 *    than a single wrong answer, which could just be a slip
 *
 * Pure function (no DB access) so the combination logic itself is
 * unit-testable independent of the DB lookups that gather these inputs.
 */
export function combineMisconceptionSignals({ llmSeverity, patternMatched = false, priorOccurrences = 0 }) {
  if (!llmSeverity && !patternMatched) return 0;

  const llmComponent = SEVERITY_WEIGHT[llmSeverity] || 0;
  // Pattern corroboration matters most when the LLM's own judgment is
  // weak/absent — two independent low-confidence signals agreeing is
  // meaningfully stronger evidence than either alone; but it shouldn't be
  // able to push risk above what one strong signal already implies.
  const patternBonus = patternMatched ? 0.3 : 0;
  // Each additional confirmed recurrence raises risk, but with
  // diminishing returns — the third occurrence of the same error is much
  // more telling than the tenth.
  const recurrenceBonus = priorOccurrences > 0 ? Math.min(0.3, priorOccurrences * 0.12) : 0;

  return Math.max(0, Math.min(1, llmComponent + patternBonus + recurrenceBonus - (llmComponent > 0 && patternMatched ? patternBonus * 0.4 : 0)));
}

/**
 * Full misconception assessment for one attempt: runs the deterministic
 * pattern matcher, checks for a recurring unresolved misconception on this
 * concept, and combines both with the LLM's own judgment (already computed
 * by evaluateFreeResponse/evaluateQuestionAnswer in llm.js — this doesn't
 * make a second LLM call, it enriches the first call's output) into one
 * risk score. This is what /attempts/evaluate and /attempts/durable call
 * after getting the LLM's evaluation, rather than the old crude mapping of
 * "LLM said severity=high" -> risk=1, "medium" -> 0.7, done inline with no
 * corroboration or memory of past attempts.
 */
export async function assessMisconceptionRisk({ answer, domain, userId, courseId, conceptId, llmMisconception, llmSeverity, session = null }) {
  const patternMatch = await detectMisconception(answer, domain);
  const description = llmMisconception || patternMatch?.description || null;
  const key = misconceptionKey(description);

  let priorOccurrences = 0;
  if (userId && courseId && conceptId && key) {
    const query = Misconception.findOne({
      user: userId, course: courseId, concept: conceptId, resolved: false, misconceptionKey: key,
    }).select("occurrences");
    if (session) query.session(session);
    const existing = await query.lean();
    priorOccurrences = existing?.occurrences || 0;
  }

  const risk = combineMisconceptionSignals({
    llmSeverity,
    patternMatched: Boolean(patternMatch),
    priorOccurrences,
  });

  const severity = risk >= 0.7 ? "high" : risk >= 0.4 ? "medium" : risk > 0 ? "low" : null;

  return { risk, description, misconceptionKey: key || null, severity, patternMatched: Boolean(patternMatch), priorOccurrences };
}

export async function seedMisconceptionPatterns() {
  const existing = await MisconceptionPattern.countDocuments();
  if (existing > 0) return;

  const patterns = [
    {
      domain: "biology",
      pattern: "Thinks photosynthesis makes glucose directly",
      description: "Light reactions produce ATP/NADPH, not glucose. Glucose is made in dark reactions.",
      regex: "light.*glucose|photosynthesis.*makes.*glucose",
      severity: "high",
    },
    {
      domain: "biology",
      pattern: "Confuses mitochondria with chloroplast",
      description: "Mitochondria are in all cells (ATP). Chloroplasts only in plants (photosynthesis).",
      keywords: ["mito in plants", "chloro in animal"],
      severity: "medium",
    },
    {
      domain: "chemistry",
      pattern: "Thinks ionic bonds are only in metals",
      description: "Ionic bonds form between any cation and anion, not just metals.",
      regex: "ionic.*metal|metal.*ionic",
      severity: "medium",
    },
    {
      domain: "physics",
      pattern: "Thinks heavier objects fall faster",
      description: "In vacuum, all objects fall at the same rate (g). Air resistance differs by shape.",
      keywords: ["heavy falls faster", "heavier drops quicker"],
      severity: "high",
    },
    {
      domain: "math",
      pattern: "Thinks a negative times negative is negative",
      description: "Negative × negative = positive. Negative × positive = negative.",
      regex: "neg.*neg.*neg(?!ative)",
      severity: "high",
    },
  ];

  await MisconceptionPattern.insertMany(patterns);
}

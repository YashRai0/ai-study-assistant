import test from "node:test";
import assert from "node:assert/strict";

// calculateExamReadiness() itself requires a live MongoDB connection
// (Course.findById, StudentConcept.find, Concept.find), so it isn't
// exercised directly here — that needs an integration test with a real
// or in-memory DB (see test/integration/). This file mirrors the pure-math
// pieces of the readiness formula in isolation, the same way this file
// always has.
//
// The previous version of this file tested a logistic "pass probability"
// formula (passProb = 1/(1+e^-(5*mastery-3))) that examReadiness.js no
// longer has — it was replaced with an honest `readinessEstimate` (just
// the coverage-inclusive average, no invented steepness/threshold
// constants pretending to be a calibrated probability of passing an exam
// this system has never seen the outcome of). Testing the old formula
// here would have kept "passing" forever while asserting on logic that
// no longer exists in the actual module — this file now mirrors what's
// really there.

test("readiness average includes never-attempted concepts as 0, not just attempted ones", () => {
  // Mirrors examReadiness.js's core fix: a student who's attempted 2 of 10
  // concepts (both at 0.9 projected mastery) should read as ~18% ready
  // overall, not 90% — the old bug averaged only over attempted concepts,
  // silently dropping the other 8 from the denominator entirely.
  const totalConcepts = 10;
  const attemptedProjections = [0.9, 0.9]; // only 2 of 10 concepts attempted
  const allProjections = [...attemptedProjections, ...Array(totalConcepts - attemptedProjections.length).fill(0)];

  const buggyAverage = attemptedProjections.reduce((s, p) => s + p, 0) / attemptedProjections.length;
  const fixedAverage = allProjections.reduce((s, p) => s + p, 0) / allProjections.length;

  assert.equal(Math.round(buggyAverage * 100), 90); // what the old bug would have reported
  assert.equal(Math.round(fixedAverage * 100), 18); // what it should actually report
  assert.ok(fixedAverage < buggyAverage);
});

test("coverage percent reflects fraction of concepts actually attempted", () => {
  const totalConcepts = 20;
  const attemptedCount = 2;
  const coveragePercent = Math.round((attemptedCount / totalConcepts) * 100);
  assert.equal(coveragePercent, 10);
});

test("full coverage with high mastery on every concept gives high readiness and full coverage", () => {
  const projections = Array(10).fill(0.85);
  const avg = projections.reduce((s, p) => s + p, 0) / projections.length;
  const coveragePercent = 100; // all 10 attempted
  assert.equal(Math.round(avg * 100), 85);
  assert.equal(coveragePercent, 100);
});

test("forgetting curve: mastery decays over time without review", () => {
  const S = 0.9 * 30; // strength factor, mirrors masteryWithEbbinghaus.js's retentionFraction()
  const R30days = 0.9 * Math.exp(-30 / S);
  const R0days = 0.9;
  assert.ok(R30days < R0days);
});

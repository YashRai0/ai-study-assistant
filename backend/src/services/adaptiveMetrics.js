import AdaptiveMetric from "../models/AdaptiveMetric.js";

// A lightweight event log for measuring whether the adaptive engine
// itself is actually working — the "does intervention X measurably
// improve performance" question every review of this codebase has come
// back to, and the thing to build before adding more AI features (see
// recordAttempt in mastery.js for the one call site actually wired up
// today).
//
// Only recordMasteryDelta is called anywhere right now. recordActionAcceptance
// and recordRetentionCheckpoint are real, usable functions — schema and
// index already support their metricType values — but nothing in the app
// currently has a UI signal for "did the student actually engage with the
// recommended action" or a scheduled job to re-check retention hours
// later, so calling them today would just be recording zeros. Kept here,
// documented as not-yet-wired, rather than silently omitted and
// rediscovered as a surprise gap later.
export async function recordAdaptiveMetric(data, { session = null } = {}) {
  const [doc] = await AdaptiveMetric.create([data], session ? { session } : {});
  return doc;
}

export async function recordMasteryDelta({
  user, course, concept, sessionId, before, after, metadata = {}, session = null,
}) {
  return recordAdaptiveMetric({
    user, course, concept, sessionId,
    metricType: "mastery_delta",
    value: Number(after) - Number(before),
    baseline: Number(before),
    metadata: { ...metadata, after: Number(after) },
  }, { session });
}

// Not yet called anywhere — see file comment above.
export async function recordActionAcceptance({
  user, course, concept, sessionId, accepted, metadata = {}, session = null,
}) {
  return recordAdaptiveMetric({
    user, course, concept, sessionId,
    metricType: "action_accepted",
    value: accepted ? 1 : 0,
    metadata,
  }, { session });
}

// Not yet called anywhere — see file comment above.
export async function recordRetentionCheckpoint({
  user, course, concept, sessionId, retention, hoursSinceSession, metadata = {}, session = null,
}) {
  return recordAdaptiveMetric({
    user, course, concept, sessionId,
    metricType: "retention_checkpoint",
    value: Number(retention),
    metadata: { ...metadata, hoursSinceSession },
  }, { session });
}

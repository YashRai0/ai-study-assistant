import mongoose from "mongoose";

const outcomeSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  concept: { type: mongoose.Schema.Types.ObjectId, ref: "Concept", required: true },
  // Client-supplied idempotency key (mirrors Attempt.eventId) — lets
  // POST /tutor/respond be safely retried (double-click, network retry)
  // without recording a second mastery update for the same intervention.
  eventId: { type: String, default: null, index: true },
  // Kept in sync with the action `type` values nextAction.js's
  // rankConcepts() actually produces — see src/services/nextAction.js.
  interventionType: { type: String, enum: ["TEACH", "REVIEW", "TEST", "MISCONCEPTION_FIX", "PREREQUISITE_GAP"], required: true },
  // The specific tutoring strategy used, distinct from interventionType
  // above: interventionType is the coarse action-level bucket (e.g.
  // "MISCONCEPTION_FIX"), while strategy is which of the five tutoring
  // approaches actually delivered it (see TutorInteraction — this is
  // denormalized from there at creation time in POST /tutor/respond,
  // rather than requiring a join for something as cheap and stable as an
  // enum value). Needed to answer "which teaching strategy works best for
  // this student" — see services/analyticsService.js's
  // strategyEffectiveness — since interventionType alone conflates e.g.
  // socratic_probe and direct_instruction whenever they're both used to
  // fix the same kind of gap.
  strategy: { type: String, enum: ["misconception_confrontation", "direct_instruction", "socratic_probe", "worked_example", "test_transfer"], default: null },
  // Back-reference to the pending question this outcome resolved, for
  // anything that needs the full intervention content/question text
  // rather than just the strategy label.
  interaction: { type: mongoose.Schema.Types.ObjectId, ref: "TutorInteraction", default: null },
  outcome: { type: String, enum: ["success", "partial", "failure"], required: true },
  masteryDelta: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now, index: true },
}, { timestamps: true });

outcomeSchema.index({ user: 1, eventId: 1 }, { unique: true, sparse: true });
outcomeSchema.index({ user: 1, strategy: 1 });

export default mongoose.model("InterventionOutcome", outcomeSchema);

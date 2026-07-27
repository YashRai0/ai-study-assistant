import mongoose from "mongoose";

const dayPlanSchema = new mongoose.Schema(
  {
    day: { type: Number, required: true },
    date: { type: String }, // "YYYY-MM-DD" if an exam date was given; omitted otherwise
    subject: { type: String, required: true },
    topics: { type: [String], required: true },
    focus: { type: String, required: true },
    estimatedMinutes: { type: Number, required: true },
    completed: { type: Boolean, default: false },
  },
  { _id: false }
);

const studyPlanSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  planTitle: { type: String, required: true },
  scope: { type: String, required: true }, // subject name, or "All subjects"
  examDate: { type: String }, // "YYYY-MM-DD", if one was given
  days: { type: [dayPlanSchema], required: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("StudyPlan", studyPlanSchema);

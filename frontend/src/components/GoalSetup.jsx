import { useState } from "react";
import client from "../api/client.js";

export default function GoalSetup({ courseId, onClose }) {
  const [examDate, setExamDate] = useState("");
  const [targetScore, setTargetScore] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!examDate || !targetScore) return;
    setSaving(true);
    try {
      await client.patch(`/learning/courses/${courseId}`, {
        examDate: new Date(examDate).toISOString(),
        targetScore: Number(targetScore),
      });
      onClose?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 p-4">
      <div className="rounded-2xl bg-white p-6 max-w-sm">
        <h2 className="font-display text-xl font-semibold text-ink-900">Set your goal</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink-900">Exam date</label>
            <input
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-100 p-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-900">Target score (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              value={targetScore}
              onChange={(e) => setTargetScore(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-100 p-2"
            />
          </div>
        </div>
        <div className="mt-6 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-full border border-ink-900 py-2 text-ink-900"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!examDate || !targetScore || saving}
            className="flex-1 rounded-full bg-ink-900 py-2 text-paper disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

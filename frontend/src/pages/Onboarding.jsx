import { useState } from "react";
import { useNavigate } from "react-router-dom";
import client from "../api/client.js";

export default function Onboarding() {
  const [step, setStep] = useState(1); // 1=welcome, 2=course setup, 3=upload, 4=demo, 5=done
  const [courseTitle, setCourseTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [examDate, setExamDate] = useState("");
  const [courseId, setCourseId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const navigate = useNavigate();

  const subjects = ["Biology", "Chemistry", "Physics", "Mathematics", "English"];

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("subject", subject);
    // Without this, the upload pipeline auto-creates (or matches) a course
    // by title === subject — since the course from step 2 was created with
    // title = courseTitle (not subject), that lookup wouldn't find it, and
    // the student would end up with two separate courses: an empty one
    // with their exam date, and a second one with their notes but no date.
    if (courseId) formData.append("courseId", courseId);
    try {
      await client.post("/upload", formData);
      setStep(4);
    } catch {
      alert("Upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  };

  const createCourse = async () => {
    if (!courseTitle.trim() || !subject) return;
    try {
      const { data } = await client.post("/learning/courses", {
        title: courseTitle,
        subject,
        examDate: examDate ? new Date(examDate).toISOString() : undefined,
      });
      setCourseId(data.course._id);
      setStep(3);
    } catch {
      alert("Failed to create course.");
    }
  };

  const finishOnboarding = () => {
    localStorage.setItem("onboarding_done", "true");
    navigate("/");
  };

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      {step === 1 && (
        <div className="text-center">
          <h1 className="font-display text-4xl font-semibold text-ink-900">
            Welcome to your learning journey
          </h1>
          <p className="mt-4 text-ink-600">
            An adaptive tutor personalized to your learning pace and gaps.
          </p>
          <button
            onClick={() => setStep(2)}
            className="mt-8 rounded-full bg-ink-900 px-6 py-3 text-paper"
          >
            Get started →
          </button>
        </div>
      )}

      {step === 2 && (
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900">
            Let's set up your course
          </h1>
          <div className="mt-6 space-y-4">
            <input
              type="text"
              placeholder="Course name (e.g., NEET Biology)"
              value={courseTitle}
              onChange={(e) => setCourseTitle(e.target.value)}
              className="w-full rounded-xl border border-ink-100 p-3"
            />
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-xl border border-ink-100 p-3"
            >
              <option value="">Select subject</option>
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              className="w-full rounded-xl border border-ink-100 p-3"
            />
            <button
              onClick={createCourse}
              disabled={!courseTitle.trim() || !subject}
              className="w-full rounded-full bg-ink-900 py-3 text-paper disabled:opacity-40"
            >
              Continue →
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900">
            Upload your material
          </h1>
          <p className="mt-2 text-ink-600">Textbook, notes, or any PDF you want to learn from.</p>
          <div className="mt-6 rounded-2xl border-2 border-dashed border-ink-100 p-8 text-center">
            <label className="cursor-pointer">
              <p className="font-medium text-ink-900">Click to upload PDF</p>
              <p className="text-sm text-ink-400">or drag and drop</p>
              <input
                type="file"
                accept=".pdf"
                onChange={handleUpload}
                disabled={uploading}
                className="hidden"
              />
            </label>
          </div>
          {uploading && <p className="mt-4 text-center text-ink-400">Uploading…</p>}
          <button
            onClick={() => setStep(4)}
            className="mt-6 w-full rounded-full border border-ink-900 py-3 text-ink-900"
          >
            Skip for now
          </button>
        </div>
      )}

      {step === 4 && (
        <div className="text-center">
          <h1 className="font-display text-2xl font-semibold text-ink-900">
            You're all set!
          </h1>
          <p className="mt-4 text-ink-600">
            Your personalized learning plan is ready. Your tutor will adapt to your pace.
          </p>
          <button
            onClick={finishOnboarding}
            className="mt-8 rounded-full bg-ink-900 px-6 py-3 text-paper"
          >
            Start learning →
          </button>
        </div>
      )}
    </main>
  );
}

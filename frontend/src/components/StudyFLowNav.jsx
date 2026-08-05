import { Link } from "react-router-dom";

const STEPS = [
  { key: "chat", label: "Chat", path: (pdfId) => `/chat/${pdfId}` },
  { key: "summary", label: "Summary", path: (pdfId) => `/summary/${pdfId}` },
  { key: "flashcards", label: "Flashcards", path: (pdfId) => `/flashcards/${pdfId}` },
  { key: "quiz", label: "Quiz", path: (pdfId) => `/quiz/${pdfId}` },
  { key: "review", label: "Review", path: () => "/review" },
];

export default function StudyFlowNav({ pdfId, current }) {
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Study flow">
      {STEPS.map((step) => (
        <Link
          key={step.key}
          to={step.path(pdfId)}
          aria-current={step.key === current ? "step" : undefined}
          className={`rounded-full px-3 py-1 text-xs font-medium transition ${
            step.key === current
              ? "bg-ink-900 text-paper"
              : "border border-ink-100 text-ink-600 hover:border-highlight"
          }`}
        >
          {step.label}
        </Link>
      ))}
    </nav>
  );
}
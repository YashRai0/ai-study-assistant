import { useEffect, useState } from "react";
import client from "../api/client.js";

export default function TutorResponse({ conceptId, misconception, onCheckAnswer }) {
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedAnswer, setSelectedAnswer] = useState(null);

  useEffect(() => {
    if (!conceptId) return;
    client
      .get(`/learning/tutor/${conceptId}`, {
        params: { misconception },
      })
      .then(({ data }) => setResponse(data))
      .finally(() => setLoading(false));
  }, [conceptId, misconception]);

  if (loading) return <p className="text-ink-400">Tutor is thinking…</p>;
  if (!response) return <p className="text-ink-500">Couldn't load explanation.</p>;

  return (
    <div className="space-y-6">
      {response.sections?.map((section) => (
        <div key={section.type} className="rounded-xl border border-ink-100 bg-white p-5">
          <h3 className="font-semibold text-ink-900">{section.title}</h3>

          {section.type === "what_is_it" && (
            <p className="mt-3 text-sm text-ink-600">{section.content}</p>
          )}

          {section.type === "how_it_works" && (
            <div className="mt-3 whitespace-pre-wrap text-sm text-ink-600">
              {section.content}
            </div>
          )}

          {section.type === "why_it_matters" && (
            <p className="mt-3 text-sm text-ink-600">{section.content}</p>
          )}

          {section.type === "misconception" && (
            <div className="mt-3 rounded-lg bg-amber-50 p-3">
              <p className="text-sm text-amber-900">{section.content}</p>
            </div>
          )}

          {section.type === "check" && (
            <div className="mt-4 space-y-3">
              <p className="text-sm font-medium text-ink-900">{section.question}</p>
              <div className="space-y-2">
                {section.options?.map((option, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setSelectedAnswer(idx);
                      const isCorrect = idx === section.correctOption;
                      onCheckAnswer?.({ isCorrect, selectedIndex: idx });
                    }}
                    className={`w-full rounded-lg border p-2 text-left text-sm transition ${
                      selectedAnswer === idx
                        ? idx === section.correctOption
                          ? "border-green-400 bg-green-50"
                          : "border-red-400 bg-red-50"
                        : "border-ink-100 hover:border-ink-300"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
              {selectedAnswer !== null && (
                <p className={`text-sm font-medium ${selectedAnswer === section.correctOption ? "text-green-600" : "text-red-600"}`}>
                  {selectedAnswer === section.correctOption ? "✓ Correct!" : "Not quite. Try again or continue."}
                </p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

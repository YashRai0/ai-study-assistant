import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import client from "../api/client.js";
import StudyFlowNav from "../components/StudyFlowNav.jsx";

// Generates Socratic hints based on question content
function generateSocraticHint(question, level = 1) {
  if (level === 1) {
    const words = question.split(" ").filter((w) => w.length > 5);
    const keyTerm = words[0] || "the core concept";
    return `💡 Consider how ${keyTerm.replace(/[^a-zA-Z]/g, "")} behaves in standard conditions. What principle directly governs it?`;
  }
  return "🔍 Elimination clue: Look closely for extreme qualifiers (like 'always' or 'never') which often signal common misconceptions.";
}

export default function Quiz() {
  const { pdfId } = useParams();
  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [revealedHints, setRevealedHints] = useState({});

  async function generate() {
    setLoading(true);
    setError("");
    setSubmitted(false);
    setAnswers({});
    setRevealedHints({});
    try {
      const { data } = await client.post(`/quiz/${pdfId}`, { mcq: 10, trueFalse: 5, shortAnswer: 5 });
      setQuiz(data.quiz);
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't generate a quiz. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function scoreObjective() {
    if (!quiz) return { correct: 0, total: 0 };
    let correct = 0;
    let total = 0;
    quiz.mcq?.forEach((q, i) => {
      total++;
      if (answers[`mcq-${i}`] === q.answer) correct++;
    });
    quiz.trueFalse?.forEach((q, i) => {
      total++;
      if (answers[`tf-${i}`] === q.answer) correct++;
    });
    return { correct, total };
  }

  const { correct, total } = submitted ? scoreObjective() : { correct: 0, total: 0 };
  const scorePct = total > 0 ? Math.round((correct / total) * 100) : 0;

  async function checkAnswers() {
    setSubmitted(true);
    const { correct: score, total: outOf } = scoreObjective();
    try {
      await client.post(`/quiz/${pdfId}/attempts`, { answers, score, total: outOf });
    } catch {
      // silently ignore — best effort save
    }
  }

  const toggleHint = (qKey) => {
    setRevealedHints((prev) => {
      const current = prev[qKey] || 0;
      return { ...prev, [qKey]: current >= 2 ? 0 : current + 1 };
    });
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <StudyFlowNav pdfId={pdfId} current="quiz" />

      {/* Header */}
      <div className="mt-6 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-100 bg-indigo-50/70 px-3 py-0.5 text-xs font-semibold text-indigo-700">
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 animate-pulse" />
          Interactive Assessment
        </span>
        <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-ink-900">
          Knowledge Self-Test
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Test retrieval strength, identify misconceptions, and calibrate exam readiness.
        </p>
      </div>

      {!quiz ? (
        <div className="mt-10 rounded-3xl border border-dashed border-ink-200 bg-white/70 p-10 text-center shadow-xs">
          <span className="text-4xl">🎯</span>
          <h2 className="mt-3 font-display text-lg font-bold text-ink-900">Ready to test your retention?</h2>
          <p className="mx-auto mt-1 max-w-sm text-xs text-ink-500">
            Generate an authoritative assessment combining multiple choice, true/false, and short answer questions.
          </p>
          <button
            onClick={generate}
            disabled={loading}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-ink-900 px-6 py-3 text-sm font-semibold text-paper shadow hover:bg-ink-800 transition disabled:opacity-50"
          >
            <span>{loading ? "Synthesizing quiz…" : "Generate Quiz ✨"}</span>
          </button>
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {/* Completion Celebration Score Banner */}
          {submitted && (
            <div
              className={`rounded-3xl border p-6 sm:p-8 text-center shadow-md transition-all animate-in zoom-in-95 ${
                scorePct >= 80
                  ? "border-emerald-200 bg-emerald-50/50"
                  : scorePct >= 50
                  ? "border-amber-200 bg-amber-50/50"
                  : "border-rose-200 bg-rose-50/50"
              }`}
            >
              <span className="text-4xl">{scorePct >= 80 ? "🎉" : scorePct >= 50 ? "📈" : "🧱"}</span>
              <h2 className="mt-2 font-display text-2xl font-extrabold text-ink-900">
                {scorePct >= 80
                  ? "Mastery Achieved!"
                  : scorePct >= 50
                  ? "Good Progress — Keep Going!"
                  : "Needs Reinforcement"}
              </h2>
              <p className="mt-1 text-xs text-ink-600">
                You scored <strong className="text-ink-900">{correct} of {total}</strong> objective items correct ({scorePct}%).
              </p>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={generate}
                  className="rounded-full bg-ink-900 px-5 py-2.5 text-xs font-semibold text-paper shadow-xs hover:bg-ink-800 transition"
                >
                  New Quiz Attempt ↻
                </button>
                <Link
                  to="/review"
                  className="rounded-full border border-ink-200 bg-white px-5 py-2.5 text-xs font-semibold text-ink-700 hover:bg-ink-50 transition shadow-2xs"
                >
                  Review Spaced Queue →
                </Link>
                <Link
                  to="/dashboard"
                  className="rounded-full border border-ink-200 bg-white px-5 py-2.5 text-xs font-semibold text-ink-700 hover:bg-ink-50 transition shadow-2xs"
                >
                  Back to Dashboard
                </Link>
              </div>
            </div>
          )}

          {/* Multiple Choice Section */}
          {quiz.mcq?.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center justify-between border-b border-ink-100 pb-2">
                <h2 className="font-display text-lg font-bold text-ink-900 flex items-center gap-2">
                  <span>Part 1: Multiple Choice</span>
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700">
                    {quiz.mcq.length}
                  </span>
                </h2>
              </div>

              <div className="space-y-4">
                {quiz.mcq.map((q, i) => {
                  const qKey = `mcq-${i}`;
                  const selectedVal = answers[qKey];
                  const hintLevel = revealedHints[qKey] || 0;
                  const isCorrect = submitted && selectedVal === q.answer;

                  return (
                    <div
                      key={i}
                      className="rounded-2xl border border-ink-100 bg-white p-5 shadow-2xs space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-medium text-ink-900 text-sm leading-relaxed">
                          <span className="font-bold text-ink-400 mr-2">{i + 1}.</span>
                          {q.question}
                        </p>
                        {!submitted && (
                          <button
                            type="button"
                            onClick={() => toggleHint(qKey)}
                            className="shrink-0 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50/60 px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100 transition shadow-2xs"
                            title="Reveal Socratic hint"
                          >
                            <span>💡</span>
                            <span>{hintLevel > 0 ? `Hint ${hintLevel}/2` : "Hint"}</span>
                          </button>
                        )}
                      </div>

                      {/* Progressive Socratic Hint Box */}
                      {hintLevel > 0 && !submitted && (
                        <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-3 text-xs text-amber-900 animate-in fade-in">
                          <p className="font-medium">{generateSocraticHint(q.question, hintLevel)}</p>
                        </div>
                      )}

                      {/* Tactile Option Cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                        {q.options?.map((opt) => {
                          const isOptionSelected = selectedVal === opt;
                          const isOptionAnswer = q.answer === opt;

                          let optionClass = "border-ink-200 bg-white hover:border-ink-300 hover:bg-ink-50/40 text-ink-800";
                          if (!submitted && isOptionSelected) {
                            optionClass = "border-indigo-600 bg-indigo-50/70 text-indigo-950 font-semibold ring-2 ring-indigo-500/20";
                          } else if (submitted) {
                            if (isOptionAnswer) {
                              optionClass = "border-emerald-500 bg-emerald-50 text-emerald-950 font-bold ring-2 ring-emerald-500/30";
                            } else if (isOptionSelected && !isOptionAnswer) {
                              optionClass = "border-rose-400 bg-rose-50 text-rose-950 font-bold line-through ring-2 ring-rose-500/20";
                            } else {
                              optionClass = "border-ink-100 bg-ink-50/30 text-ink-400 opacity-60";
                            }
                          }

                          return (
                            <button
                              key={opt}
                              type="button"
                              disabled={submitted}
                              onClick={() => setAnswers((a) => ({ ...a, [qKey]: opt }))}
                              className={`flex items-center justify-between rounded-xl border p-3.5 text-left text-xs transition-all ${optionClass}`}
                            >
                              <span>{opt}</span>
                              {submitted && isOptionAnswer && <span className="text-emerald-600 font-bold">✓</span>}
                              {submitted && isOptionSelected && !isOptionAnswer && (
                                <span className="text-rose-600 font-bold">✕</span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Post-Submission Result & Explanation */}
                      {submitted && (
                        <div
                          className={`mt-2 rounded-xl p-3 text-xs ${
                            isCorrect ? "bg-emerald-50 text-emerald-900 border border-emerald-200" : "bg-rose-50 text-rose-900 border border-rose-200"
                          }`}
                        >
                          <span className="font-bold">{isCorrect ? "✓ Correct!" : "✕ Incorrect."}</span>
                          {!isCorrect && (
                            <span className="ml-1">The correct answer is: <strong className="underline">{q.answer}</strong></span>
                          )}
                          {q.explanation && (
                            <p className="mt-1 text-ink-700 leading-relaxed">{q.explanation}</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* True / False Section */}
          {quiz.trueFalse?.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center justify-between border-b border-ink-100 pb-2">
                <h2 className="font-display text-lg font-bold text-ink-900 flex items-center gap-2">
                  <span>Part 2: True / False</span>
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700">
                    {quiz.trueFalse.length}
                  </span>
                </h2>
              </div>

              <div className="space-y-4">
                {quiz.trueFalse.map((q, i) => {
                  const qKey = `tf-${i}`;
                  const selectedVal = answers[qKey];
                  const isCorrect = submitted && selectedVal === q.answer;

                  return (
                    <div
                      key={i}
                      className="rounded-2xl border border-ink-100 bg-white p-5 shadow-2xs space-y-3"
                    >
                      <p className="font-medium text-ink-900 text-sm leading-relaxed">
                        <span className="font-bold text-ink-400 mr-2">{i + 1}.</span>
                        {q.question}
                      </p>

                      <div className="flex gap-3">
                        {[true, false].map((val) => {
                          const isOptionSelected = selectedVal === val;
                          const isOptionAnswer = q.answer === val;

                          let btnClass = "border-ink-200 bg-white text-ink-800 hover:border-ink-300";
                          if (!submitted && isOptionSelected) {
                            btnClass = "border-indigo-600 bg-indigo-50/70 text-indigo-950 font-semibold ring-2 ring-indigo-500/20";
                          } else if (submitted) {
                            if (isOptionAnswer) {
                              btnClass = "border-emerald-500 bg-emerald-50 text-emerald-950 font-bold ring-2 ring-emerald-500/30";
                            } else if (isOptionSelected && !isOptionAnswer) {
                              btnClass = "border-rose-400 bg-rose-50 text-rose-950 font-bold ring-2 ring-rose-500/20";
                            } else {
                              btnClass = "border-ink-100 bg-ink-50/30 text-ink-400 opacity-60";
                            }
                          }

                          return (
                            <button
                              key={String(val)}
                              type="button"
                              disabled={submitted}
                              onClick={() => setAnswers((a) => ({ ...a, [qKey]: val }))}
                              className={`flex-1 rounded-xl border py-2.5 px-4 text-xs font-semibold transition-all ${btnClass}`}
                            >
                              {val ? "True" : "False"}
                            </button>
                          );
                        })}
                      </div>

                      {submitted && (
                        <div
                          className={`mt-2 rounded-xl p-3 text-xs ${
                            isCorrect ? "bg-emerald-50 text-emerald-900 border border-emerald-200" : "bg-rose-50 text-rose-900 border border-rose-200"
                          }`}
                        >
                          <span className="font-bold">{isCorrect ? "✓ Correct!" : "✕ Incorrect."}</span>
                          {!isCorrect && (
                            <span className="ml-1">Statement is: <strong className="underline">{String(q.answer)}</strong></span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Short Answer Section */}
          {quiz.shortAnswer?.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center justify-between border-b border-ink-100 pb-2">
                <h2 className="font-display text-lg font-bold text-ink-900 flex items-center gap-2">
                  <span>Part 3: Conceptual Reflection</span>
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700">
                    {quiz.shortAnswer.length}
                  </span>
                </h2>
              </div>

              <div className="space-y-4">
                {quiz.shortAnswer.map((q, i) => (
                  <div key={i} className="rounded-2xl border border-ink-100 bg-white p-5 shadow-2xs space-y-3">
                    <p className="font-medium text-ink-900 text-sm leading-relaxed">
                      <span className="font-bold text-ink-400 mr-2">{i + 1}.</span>
                      {q.question}
                    </p>
                    {submitted && (
                      <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-3 text-xs text-ink-700">
                        <span className="font-bold text-ink-900 block mb-0.5">Model Answer / Key Points:</span>
                        <p className="leading-relaxed">{q.answer}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Action Bar */}
          {!submitted ? (
            <div className="sticky bottom-6 flex justify-center py-2">
              <button
                type="button"
                onClick={checkAnswers}
                className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-8 py-3.5 text-sm font-bold text-paper shadow-lg hover:bg-ink-800 transition transform hover:-translate-y-0.5"
              >
                <span>Check My Answers →</span>
              </button>
            </div>
          ) : (
            <div className="text-center pt-4">
              <button
                type="button"
                onClick={generate}
                className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-6 py-3 text-xs font-semibold text-paper shadow hover:bg-ink-800 transition"
              >
                <span>Generate Another Quiz ↻</span>
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-center text-xs font-semibold text-red-700">
          {error}
        </div>
      )}
    </main>
  );
}

import { useState } from "react";
import { useParams } from "react-router-dom";
import client from "../api/client.js";

export default function Quiz() {
  const { pdfId } = useParams();
  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setLoading(true);
    setError("");
    setSubmitted(false);
    setAnswers({});
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

  async function checkAnswers() {
    setSubmitted(true);
    const { correct: score, total: outOf } = scoreObjective();
    // Best-effort: the score is already shown to the user regardless of
    // whether this save succeeds, so a failure here shouldn't block anything
    // — it just means this attempt won't show up in the analytics dashboard.
    try {
      await client.post(`/quiz/${pdfId}/attempts`, { score, total: outOf });
    } catch {
      // silently ignore — see comment above
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-display text-2xl font-semibold text-ink-900">Quiz yourself</h1>

      {!quiz ? (
        <button
          onClick={generate}
          disabled={loading}
          className="mt-8 rounded-full bg-highlight px-6 py-3 font-medium text-ink-900 disabled:opacity-50"
        >
          {loading ? "Generating…" : "Generate a quiz"}
        </button>
      ) : (
        <div className="mt-8 space-y-10">
          <section>
            <h2 className="font-display text-lg font-semibold">Multiple choice</h2>
            {quiz.mcq?.map((q, i) => (
              <div key={i} className="mt-4 rounded-xl border border-ink-100 bg-white/70 p-4">
                <p className="font-medium">{q.question}</p>
                <div className="mt-2 space-y-1">
                  {q.options?.map((opt) => (
                    <label key={opt} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name={`mcq-${i}`}
                        checked={answers[`mcq-${i}`] === opt}
                        onChange={() => setAnswers((a) => ({ ...a, [`mcq-${i}`]: opt }))}
                      />
                      {opt}
                    </label>
                  ))}
                </div>
                {submitted && (
                  <p className={`mt-2 text-sm ${answers[`mcq-${i}`] === q.answer ? "text-sage" : "text-red-600"}`}>
                    Correct answer: {q.answer}
                  </p>
                )}
              </div>
            ))}
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold">True / False</h2>
            {quiz.trueFalse?.map((q, i) => (
              <div key={i} className="mt-4 rounded-xl border border-ink-100 bg-white/70 p-4">
                <p className="font-medium">{q.question}</p>
                <div className="mt-2 flex gap-4 text-sm">
                  {[true, false].map((val) => (
                    <label key={String(val)} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`tf-${i}`}
                        checked={answers[`tf-${i}`] === val}
                        onChange={() => setAnswers((a) => ({ ...a, [`tf-${i}`]: val }))}
                      />
                      {String(val)}
                    </label>
                  ))}
                </div>
                {submitted && (
                  <p className={`mt-2 text-sm ${answers[`tf-${i}`] === q.answer ? "text-sage" : "text-red-600"}`}>
                    Correct answer: {String(q.answer)}
                  </p>
                )}
              </div>
            ))}
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold">Short answer</h2>
            {quiz.shortAnswer?.map((q, i) => (
              <div key={i} className="mt-4 rounded-xl border border-ink-100 bg-white/70 p-4">
                <p className="font-medium">{q.question}</p>
                {submitted && <p className="mt-2 text-sm text-ink-400">Model answer: {q.answer}</p>}
              </div>
            ))}
          </section>

          {!submitted ? (
            <button
              onClick={checkAnswers}
              className="rounded-full bg-ink-900 px-6 py-3 text-paper"
            >
              Check my answers
            </button>
          ) : (
            <p className="font-display text-xl text-ink-900">
              Score: {correct} / {total} on multiple choice + true/false
            </p>
          )}
        </div>
      )}
      {error && <p className="mt-4 text-red-600">{error}</p>}
    </main>
  );
}

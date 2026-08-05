import { Link } from "react-router-dom";

export default function About() {
  return (
    <div className="bg-paper text-ink-900">
      <article className="mx-auto max-w-2xl px-6 pb-20 pt-6">
        <span className="mb-4 block text-xs font-semibold uppercase tracking-wide text-highlight">
          About Us
        </span>
        <h1 className="font-display text-3xl font-medium leading-tight text-ink-900 sm:text-4xl">
          We built the study tool we wished we had.
        </h1>

        <div className="mt-8 flex flex-col gap-5 text-[17px] leading-relaxed text-ink-400">
          <p>A few days before an exam, studying usually turns into the same routine.</p>

          <p>
            Open a huge PDF. Read a few pages. Highlight everything that looks important.
            Read it again the next day and hope it sticks.
          </p>

          <p>Sometimes it does. Most of the time, it doesn't.</p>

          <p>
            When AI became popular, it looked like the perfect solution. You could upload
            an entire chapter and get a neat summary in seconds. It was faster than making
            notes yourself.
          </p>

          <p>But after using it for a while, we noticed something.</p>

          <p>
            Reading a good summary makes you feel prepared. Sitting in an exam without
            that summary is a different story.
          </p>

          <p className="font-medium text-ink-900">
            The problem wasn't understanding the material. The problem was remembering it.
          </p>

          <p className="font-medium text-ink-900">That's why we built AI Study Assistant.</p>

          <p>
            Instead of stopping at summaries, the platform turns your notes into quizzes
            and flashcards based on your own study material. As you keep studying, it
            remembers what you've already mastered and what you keep forgetting, so your
            revision focuses on the topics that actually need work.
          </p>

          <p>
            The goal isn't to replace studying. It's to make the time you already spend
            studying more effective.
          </p>

          <p>
            We're still improving the platform, adding new features, fixing things that
            don't work well, and listening to feedback from students who use it.
          </p>

          <p>For now, it's free to use.</p>
        </div>

        <div className="mt-10 rounded-2xl border border-ink-100 bg-white p-8 text-center">
          <p className="text-[15px] text-ink-900">
            If you're preparing for an exam, upload a chapter, answer a few questions, and
            see how much you really remember.
          </p>
          <Link
            to="/register"
            className="mt-5 inline-block rounded-full bg-highlight px-7 py-3.5 text-[15px] font-bold text-ink-900 transition hover:brightness-95"
          >
            Upload Your First PDF
          </Link>
        </div>
      </article>

      <footer className="border-t border-ink-100 py-8 text-center text-sm text-ink-400">
        <div className="mb-3 flex justify-center gap-5">
          <Link to="/about" className="underline hover:text-ink-900">
            About
          </Link>
          <Link to="/privacy" className="underline hover:text-ink-900">
            Privacy Policy
          </Link>
        </div>
        AI Study Assistant — built from your notes, nothing else.
      </footer>
    </div>
  );
}
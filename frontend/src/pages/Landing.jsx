import { Link } from "react-router-dom";

// Small pill tag used throughout — feature eyebrows, FAQ "flip" hints, pricing
// "included" markers. One shared component so the style can't drift between
// sections the way it would if each spot re-implemented its own badge.
function Tag({ children }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-highlight/40 bg-highlight/15 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-ink-900">
      <span className="h-1.5 w-1.5 rounded-full bg-highlight" />
      {children}
    </span>
  );
}

function FaqItem({ question, children, defaultOpen = false }) {
  return (
    <details
      className="group rounded-2xl border border-ink-100 bg-white"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-semibold text-ink-900 marker:content-none [&::-webkit-details-marker]:hidden">
        {question}
        <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-ink-400 group-open:text-ink-900">
          Flip &rarr;
        </span>
      </summary>
      <div className="border-t border-ink-100 px-5 pb-4 pt-3 text-sm leading-relaxed text-ink-400">
        {children}
      </div>
    </details>
  );
}

const FEATURES = [
  {
    tag: "Grounded",
    title: "Ask it anything from your notes",
    body: "Type a question the way you'd ask a classmate. The assistant searches your uploaded PDF, pulls the exact passage that answers it, and tells you plainly when your notes don't cover something — instead of guessing.",
    featured: true,
  },
  {
    tag: "Complete",
    title: "Compress 50 pages into one",
    body: "Pick short, medium, bullet-point, or exam-notes style. Get a revision sheet built from what you actually uploaded, in the time it takes to read this sentence.",
  },
  {
    tag: "Automatic",
    title: "Flashcards you didn't have to write",
    body: "Front-and-back cards pulled straight from your chapter, ready to flip through between classes.",
  },
  {
    tag: "Scored",
    title: "Quiz yourself before the exam does",
    body: "Multiple choice, true/false, and short answer — generated from your notes, scored as you go, so you find the gaps before your professor does.",
  },
];

const FAQS = [
  {
    q: "Is this actually free, or is there a catch?",
    a: "It's free right now. No paid tier to upgrade into, no usage cap, no card required.",
    defaultOpen: true,
  },
  {
    q: "Will it make up answers that aren't in my notes?",
    a: "No. Every answer is built only from the parts of your document that match your question, with a page reference so you can check it. If nothing matches, it says so instead of guessing.",
  },
  {
    q: "What happens to my uploaded notes?",
    a: "They're tied to your account and used only to answer your own questions — not shared into a public set library the way some flashcard tools work.",
  },
  {
    q: "What file types and sizes can I upload?",
    a: "PDF files, up to 20MB each.",
  },
];

export default function Landing() {
  return (
    <div className="bg-paper text-ink-900">
      {/* Hero */}
      <header className="mx-auto max-w-3xl px-6 pb-12 pt-10 text-center sm:pt-14">
        <span className="mb-5 block text-xs font-semibold uppercase tracking-wide text-ink-400">
          For students who'd rather understand than re-read
        </span>
        <h1 className="font-display text-4xl font-medium leading-tight text-ink-900 sm:text-5xl">
          Upload your notes.{" "}
          <span className="bg-gradient-to-t from-highlight from-[38%] to-transparent to-[38%] px-0.5">
            Ask real questions.
          </span>{" "}
          Get answers you can trust.
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-ink-400">
          No searching through 200 pages at midnight. Upload a PDF, and get answers,
          summaries, flashcards, and quizzes pulled straight from your own material —
          nothing invented, nothing generic.
        </p>
        <p className="mt-4 text-sm font-semibold text-ink-900">
          <span className="mr-1.5 text-highlight">&#10003;</span>
          Free right now — with no paid tier waiting to replace it later.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-5">
          <Link
            to="/register"
            className="rounded-full bg-highlight px-7 py-3.5 text-[15px] font-bold text-ink-900 transition hover:brightness-95"
          >
            Upload Your First PDF
          </Link>
          <Link to="/login" className="text-sm font-semibold text-ink-400 underline hover:text-ink-900">
            Already have an account? Log in
          </Link>
        </div>
        <a
          href="#how"
          className="mt-5 inline-block text-sm text-ink-400 underline decoration-ink-100 underline-offset-4 hover:text-ink-900"
        >
          See how it works &darr;
        </a>
      </header>

      {/* Proof card — the mock Q&A, visualizing the actual grounded/cited mechanic */}
      <div className="mx-auto max-w-xl px-6 pb-16">
        <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-[0_24px_60px_-28px_rgba(27,33,64,0.20)] sm:p-7">
          <p className="text-sm text-ink-400">
            <span className="font-semibold text-ink-900">You asked:</span> "What's the
            difference between the two theories in chapter 4?"
          </p>
          <div className="mt-3 rounded-xl bg-paper px-5 py-4 text-[15px] leading-relaxed text-ink-900">
            The first theory assumes fixed costs, the second allows them to vary with
            output — that's the core distinction this chapter builds on.
            <Tag>Page 41</Tag>
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-ink-400">
          Every answer traces back to a real page in your notes.
        </p>
      </div>

      {/* Features */}
      <section id="how" className="mx-auto max-w-5xl px-6 py-14">
        <h2 className="mx-auto max-w-md text-center font-display text-2xl font-medium text-ink-900 sm:text-3xl">
          Everything you'd do the night before an exam — done in minutes
        </h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className={`rounded-2xl border bg-white p-7 ${
                f.featured ? "border-highlight" : "border-ink-100"
              }`}
            >
              <Tag>{f.tag}</Tag>
              <h3 className="mt-3 font-display text-lg font-medium text-ink-900">{f.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Grounded statement */}
      <section className="mx-auto max-w-2xl px-6 py-10 text-center">
        <h2 className="font-display text-2xl font-medium text-ink-900">
          Grounded in your notes. Nothing else.
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-400">
          If your notes don't cover something, the assistant says so instead of making
          it up. That's the whole point of building this on your own material instead
          of the open internet.
        </p>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-2xl px-6 py-14">
        <div className="mb-9 text-center">
          <h2 className="font-display text-2xl font-medium text-ink-900">
            Flip through the honest answers
          </h2>
          <p className="mt-2 text-[15px] text-ink-400">
            The questions people actually ask before uploading anything.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          {FAQS.map((item) => (
            <FaqItem key={item.q} question={item.q} defaultOpen={item.defaultOpen}>
              {item.a}
            </FaqItem>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-2xl px-6 py-14 text-center">
        <h2 className="font-display text-2xl font-medium text-ink-900">
          No paid tier. Not later, not ever.
        </h2>
        <p className="mx-auto mt-2 max-w-md text-[15px] text-ink-400">
          A lot of "free" study tools start charging once you're already relying on
          them. There's nothing waiting behind this one.
        </p>

        <div className="mx-auto mt-8 max-w-sm rounded-3xl border border-ink-900 bg-white p-9 text-left">
          <div className="font-display text-5xl font-medium text-ink-900">$0</div>
          <p className="mt-1.5 text-sm text-ink-400">No paid plan waiting behind this one.</p>
          <ul className="mt-6 flex flex-col gap-3">
            {["Unlimited PDF uploads", "Document-grounded chat", "Quizzes & flashcards", "Full summaries"].map(
              (item) => (
                <li key={item} className="flex items-center gap-2.5 text-sm text-ink-900">
                  <Tag>Included</Tag>
                  {item}
                </li>
              )
            )}
          </ul>
          <Link
            to="/register"
            className="mt-7 block rounded-full bg-ink-900 py-3.5 text-center text-[15px] font-bold text-paper transition hover:bg-ink-600"
          >
            Create Free Account
          </Link>
          <p className="mt-3 text-center text-xs text-ink-400">No card needed.</p>
        </div>
      </section>

      {/* Footer */}
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
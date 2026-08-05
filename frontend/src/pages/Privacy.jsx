import { Link } from "react-router-dom";

function Section({ title, children }) {
  return (
    <div className="mt-8">
      <h2 className="font-display text-lg font-medium text-ink-900">{title}</h2>
      <div className="mt-2 flex flex-col gap-2.5 text-[15px] leading-relaxed text-ink-400">
        {children}
      </div>
    </div>
  );
}

export default function Privacy() {
  return (
    <div className="bg-paper text-ink-900">
      <article className="mx-auto max-w-xl px-6 pb-20 pt-4">
        <h1 className="font-display text-3xl font-medium text-ink-900">Privacy Policy</h1>
        <p className="mt-1.5 text-sm text-ink-400">Last updated: August 2026</p>
        <p className="mt-5 text-[16.5px] font-medium leading-relaxed text-ink-900">
          We built this to help you study — not to collect more data than we need.
        </p>
        <p className="mt-3 text-[15px] text-ink-400">
          Here's what we collect, why we collect it, and how we use it.
        </p>

        <Section title="Your account">
          <p>When you sign up, we collect your name and email address.</p>
          <p>
            We use this information to create your account, keep it secure, save your
            study progress, and let you sign in again later.
          </p>
        </Section>

        <Section title="Your study materials">
          <p>
            When you upload a PDF or another supported document, we process it so we can
            generate summaries, quizzes, flashcards, and other study tools.
          </p>
          <p>Your documents are only used to provide these features to you.</p>
        </Section>

        <Section title="Your learning progress">
          <p>We store things like quiz scores, completed flashcards, and review history.</p>
          <p>
            This helps personalize your revision. For example, if you've answered a topic
            incorrectly several times, we'll bring it back sooner than something you've
            already mastered.
          </p>
        </Section>

        <Section title="AI processing">
          <p>Some features use external AI providers to generate study content.</p>
          <p>
            When that happens, we send only the text needed to complete your request. We
            choose providers that offer API services with published policies stating that
            customer API requests aren't used to train their public AI models.
          </p>
        </Section>

        <Section title="What we don't do">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>We don't sell your personal information.</li>
            <li>We don't sell your study habits.</li>
            <li>We don't use your uploaded documents to train our own AI models.</li>
            <li>We don't share your study materials with other users.</li>
          </ul>
        </Section>

        <Section title="Cookies">
          <p>
            We use essential cookies and local storage to keep you signed in, remember
            your preferences, and keep the platform working properly.
          </p>
          <p>We don't use advertising cookies.</p>
        </Section>

        <Section title="Security">
          <p>
            We take reasonable steps to protect your information using industry-standard
            security practices. Like any online service, no system can guarantee absolute
            security, but protecting your data is something we take seriously.
          </p>
        </Section>

        <Section title="Deleting your data">
          <p>Your data belongs to you.</p>
          <p>
            You can delete your account whenever you want. When you do, we'll remove your
            account and study data from our active systems. Backup copies, if any, are
            automatically removed after our normal backup retention period.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            As the platform changes, this Privacy Policy may change too. If we make
            important updates, we'll update the date at the top of this page.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about this policy? Email us at{" "}
            <a href="mailto:support@yourdomain.com" className="font-semibold text-ink-900 underline">
              support@yourdomain.com
            </a>
            .
          </p>
        </Section>
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
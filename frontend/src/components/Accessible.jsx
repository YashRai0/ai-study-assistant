// Accessible component wrappers with ARIA labels
import { useId } from "react";

export function AccessibleButton({ label, ariaLabel, children, ...props }) {
  return (
    <button aria-label={ariaLabel || label} {...props}>
      {children || label}
    </button>
  );
}

export function AccessibleInput({ label, error, ariaLabel, id, ...props }) {
  const generatedId = useId();
  const inputId = id || generatedId;
  return (
    <div>
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-ink-900">
          {label}
        </label>
      )}
      <input
        {...props}
        id={inputId}
        aria-label={ariaLabel || label}
        aria-describedby={error ? `${inputId}-error` : undefined}
      />
      {error && (
        <p id={`${inputId}-error`} className="mt-1 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function AccessibleCard({ title, ariaLabel, children }) {
  return (
    <div
      role="article"
      aria-label={ariaLabel || title}
      className="rounded-2xl border border-ink-100 bg-white p-6"
    >
      {title && <h2 className="font-display text-lg font-semibold text-ink-900">{title}</h2>}
      {children}
    </div>
  );
}

export function AccessibleNavigation({ items }) {
  return (
    <nav role="navigation" aria-label="Main navigation">
      <ul className="flex gap-4">
        {items.map((item) => (
          <li key={item.path}>
            <a href={item.path} className="font-medium text-ink-900 hover:underline">
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function AccessibleDialog({ title, isOpen, onClose, children }) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      className="fixed inset-0 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="rounded-2xl bg-white p-6 max-w-sm">
        <h2 id="dialog-title" className="font-display text-xl font-semibold text-ink-900">
          {title}
        </h2>
        <div className="mt-4">{children}</div>
        <button
          onClick={onClose}
          aria-label="Close dialog"
          className="mt-4 rounded-full border border-ink-900 px-4 py-2 text-ink-900"
        >
          Close
        </button>
      </div>
    </div>
  );
}

export function SkipToMainContent() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0 focus:bg-ink-900 focus:text-paper focus:p-2"
    >
      Skip to main content
    </a>
  );
}

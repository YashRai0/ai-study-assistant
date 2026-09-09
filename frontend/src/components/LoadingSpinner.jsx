export default function LoadingSpinner({ size = "md" }) {
  const sizes = {
    sm: "w-4 h-4",
    md: "w-8 h-8",
    lg: "w-12 h-12",
  };

  return (
    <div className={`${sizes[size]} animate-spin rounded-full border-4 border-ink-200 border-t-ink-900`} />
  );
}

export function LoadingCard() {
  return (
    <div className="rounded-2xl border border-ink-100 bg-white p-6 animate-pulse">
      <div className="h-4 bg-ink-100 rounded w-1/3 mb-4" />
      <div className="space-y-3">
        <div className="h-3 bg-ink-100 rounded w-full" />
        <div className="h-3 bg-ink-100 rounded w-5/6" />
      </div>
    </div>
  );
}

export function LoadingPage() {
  return (
    <main className="flex items-center justify-center min-h-screen bg-paper">
      <div className="text-center">
        <LoadingSpinner size="lg" />
        <p className="mt-4 text-ink-600">Loading…</p>
      </div>
    </main>
  );
}

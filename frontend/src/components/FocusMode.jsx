import { useState, useEffect } from "react";

export default function FocusMode({ onClose, onStart }) {
  const [duration, setDuration] = useState(20);
  const [started, setStarted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(null);

  useEffect(() => {
    if (!started || timeLeft === null) return;
    if (timeLeft <= 0) {
      setStarted(false);
      onClose?.();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((t) => t - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [started, timeLeft, onClose]);

  const handleStart = () => {
    setTimeLeft(duration * 60);
    setStarted(true);
    onStart?.();
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (started) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black/80 p-4">
        <div className="rounded-3xl bg-white p-8 text-center">
          <p className="text-sm font-medium text-ink-600">Focus Mode</p>
          <p className="mt-2 text-6xl font-bold text-ink-900 font-mono">
            {formatTime(timeLeft)}
          </p>
          <p className="mt-4 text-sm text-ink-600">
            {Math.round((100 * (duration * 60 - timeLeft)) / (duration * 60))}% complete
          </p>
          <div className="mt-6 h-2 w-48 mx-auto rounded-full bg-ink-100">
            <div
              className="h-full rounded-full bg-highlight transition-all"
              style={{
                width: `${(100 * (duration * 60 - timeLeft)) / (duration * 60)}%`,
              }}
            />
          </div>
          <button
            onClick={() => setStarted(false)}
            className="mt-8 rounded-full border border-ink-900 px-6 py-2 text-ink-900"
          >
            End session
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 p-4">
      <div className="rounded-2xl bg-white p-6 max-w-sm">
        <h2 className="font-display text-xl font-semibold text-ink-900">Focus Mode</h2>
        <p className="mt-2 text-sm text-ink-600">
          Lock in for distraction-free studying with a visible countdown.
        </p>
        
        <div className="mt-6 grid grid-cols-2 gap-3">
          {[20, 45].map((mins) => (
            <button
              key={mins}
              onClick={() => setDuration(mins)}
              className={`rounded-lg py-3 font-medium transition ${
                duration === mins
                  ? "bg-ink-900 text-paper"
                  : "border border-ink-100 text-ink-900 hover:bg-ink-50"
              }`}
            >
              {mins} min
            </button>
          ))}
        </div>

        <div className="mt-6 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-full border border-ink-900 py-2 text-ink-900"
          >
            Cancel
          </button>
          <button
            onClick={handleStart}
            className="flex-1 rounded-full bg-ink-900 py-2 text-paper"
          >
            Start focus
          </button>
        </div>
      </div>
    </div>
  );
}

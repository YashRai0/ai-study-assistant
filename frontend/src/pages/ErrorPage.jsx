import { useNavigate } from "react-router-dom";

export default function ErrorPage({ statusCode = 500, message = "Something went wrong" }) {
  const navigate = useNavigate();

  const errors = {
    404: {
      title: "Page not found",
      message: "The page you're looking for doesn't exist.",
      icon: "🔍",
    },
    500: {
      title: "Server error",
      message: "Something went wrong on our end. Please try again.",
      icon: "⚠️",
    },
    503: {
      title: "Service unavailable",
      message: "We're temporarily down for maintenance.",
      icon: "🔧",
    },
  };

  const error = errors[statusCode] || errors[500];

  return (
    <main className="flex items-center justify-center min-h-screen bg-paper">
      <div className="text-center px-6">
        <p className="text-6xl mb-4">{error.icon}</p>
        <h1 className="font-display text-4xl font-semibold text-ink-900 mb-2">
          {error.title}
        </h1>
        <p className="text-lg text-ink-600 mb-8 max-w-md">{error.message}</p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => navigate("/")}
            className="rounded-full bg-ink-900 px-6 py-3 text-paper"
          >
            Go home
          </button>
          <button
            onClick={() => navigate(-1)}
            className="rounded-full border border-ink-900 px-6 py-3 text-ink-900"
          >
            Go back
          </button>
        </div>
      </div>
    </main>
  );
}

// 404 Page
export function NotFoundPage() {
  return <ErrorPage statusCode={404} />;
}

// 500 Page
export function ServerErrorPage() {
  return <ErrorPage statusCode={500} />;
}

// 503 Page
export function ServiceUnavailablePage() {
  return <ErrorPage statusCode={503} />;
}

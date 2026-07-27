import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../api/AuthContext.jsx";

export default function Navbar() {
  const { email, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="border-b border-ink-100">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/" className="font-display text-xl font-semibold text-ink-900">
          Study<span className="highlight-mark">Assistant</span>
        </Link>
        {email ? (
          <div className="flex items-center gap-4">
            <span className="text-sm text-ink-400">{email}</span>
            <Link to="/chat-all" className="text-sm font-medium text-ink-900">
              Chat all notes
            </Link>
            <Link to="/search" className="text-sm font-medium text-ink-900">
              Search
            </Link>
            <Link to="/analytics" className="text-sm font-medium text-ink-900">
              Analytics
            </Link>
            <Link to="/study-plan" className="text-sm font-medium text-ink-900">
              Study Plan
            </Link>
            <Link to="/groups" className="text-sm font-medium text-ink-900">
              Groups
            </Link>
            <Link to="/review" className="text-sm font-medium text-ink-900">
              Review
            </Link>
            <Link
              to="/dashboard"
              className="rounded-full bg-ink-900 px-5 py-2 text-sm font-medium text-paper transition hover:bg-ink-600"
            >
              Dashboard
            </Link>
            <button
              onClick={() => {
                logout();
                navigate("/");
              }}
              className="text-sm text-ink-400 hover:text-ink-900"
            >
              Log out
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm font-medium text-ink-900">
              Log in
            </Link>
            <Link
              to="/register"
              className="rounded-full bg-ink-900 px-5 py-2 text-sm font-medium text-paper transition hover:bg-ink-600"
            >
              Sign up free
            </Link>
          </div>
        )}
      </nav>
    </header>
  );
}

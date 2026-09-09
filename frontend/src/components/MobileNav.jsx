import { Link, useLocation } from "react-router-dom";

export default function MobileNav() {
  const location = useLocation();

  const tabs = [
    { path: "/study", label: "Study", icon: "📚" },
    { path: "/dashboard", label: "Home", icon: "🏠" },
    { path: "/analytics", label: "Progress", icon: "📊" },
    { path: "/settings", label: "Settings", icon: "⚙️" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-ink-100 bg-white md:hidden">
      <div className="flex justify-around">
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.path;
          return (
            <Link
              key={tab.path}
              to={tab.path}
              className={`flex flex-1 flex-col items-center justify-center py-3 text-xs font-medium transition ${
                isActive
                  ? "border-t-2 border-ink-900 text-ink-900"
                  : "text-ink-400 hover:text-ink-600"
              }`}
            >
              <span className="text-lg">{tab.icon}</span>
              <span className="mt-1">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

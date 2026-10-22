import React from "react";
import Button from "./Button.jsx";

/**
 * Standard Prepnexia Design System Empty State
 */
export default function EmptyState({
  icon = "📂",
  title,
  description,
  actionLabel,
  onAction,
  className = "",
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-200 dark:border-[#273352] p-8 sm:p-12 text-center bg-white/40 dark:bg-[#131a2c]/60 ${className}`}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-100 dark:bg-[#1f2842] text-2xl mb-4 shadow-2xs">
        {icon}
      </div>
      <h3 className="font-display text-lg font-bold text-ink-900 dark:text-ink-100">
        {title}
      </h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-ink-500 dark:text-ink-400">
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <div className="mt-5">
          <Button variant="primary" size="sm" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
}

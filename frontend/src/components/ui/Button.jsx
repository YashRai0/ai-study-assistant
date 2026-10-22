import React from "react";

/**
 * Standard Prepnexia Design System Button
 * Variants: primary | secondary | outline | ghost | danger
 * Sizes: sm | md | lg
 */
export default function Button({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  className = "",
  type = "button",
  onClick,
  ...props
}) {
  const base =
    "inline-flex items-center justify-center font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-highlight/50 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 select-none";

  const sizeClasses = {
    sm: "px-3 py-1.5 text-xs rounded-lg gap-1.5",
    md: "px-4 py-2 text-sm rounded-xl gap-2",
    lg: "px-6 py-3 text-base rounded-2xl gap-2.5 font-semibold",
  };

  const variantClasses = {
    primary:
      "bg-highlight text-ink-950 hover:bg-[#eab03d] active:bg-[#dda536] shadow-sm hover:shadow",
    secondary:
      "bg-ink-900 text-paper hover:bg-ink-800 dark:bg-ink-50 dark:text-ink-950 dark:hover:bg-white shadow-sm",
    outline:
      "border border-ink-200 dark:border-[#273352] bg-white dark:bg-[#1b233a] text-ink-700 dark:text-ink-200 hover:bg-ink-50 dark:hover:bg-[#222c4a]",
    ghost:
      "bg-transparent text-ink-600 dark:text-ink-300 hover:bg-ink-100/60 dark:hover:bg-[#1f2842] hover:text-ink-900 dark:hover:text-white",
    danger:
      "bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40",
  };

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={`${base} ${sizeClasses[size] || sizeClasses.md} ${
        variantClasses[variant] || variantClasses.primary
      } ${className}`}
      {...props}
    >
      {loading && (
        <svg
          className="h-4 w-4 animate-spin text-current"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {children}
    </button>
  );
}

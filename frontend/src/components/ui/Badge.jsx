import React from "react";

/**
 * Standard Prepnexia Design System Badge
 * Variants: default | sage | highlight | indigo | coral | outline
 * Sizes: sm | md
 */
export default function Badge({
  children,
  variant = "default",
  size = "md",
  dot = false,
  className = "",
  ...props
}) {
  const base = "inline-flex items-center font-medium select-none";

  const sizeClasses = {
    sm: "px-2 py-0.5 text-2xs rounded-md gap-1 tracking-wide",
    md: "px-2.5 py-1 text-xs rounded-lg gap-1.5",
  };

  const variantClasses = {
    default:
      "bg-ink-100 dark:bg-[#1f2842] text-ink-700 dark:text-ink-200 border border-ink-200/50 dark:border-[#273352]",
    sage:
      "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60",
    highlight:
      "bg-highlight/20 dark:bg-highlight/15 text-amber-900 dark:text-amber-200 border border-highlight/40 dark:border-highlight/30",
    indigo:
      "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900/60",
    coral:
      "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900/60",
    outline:
      "bg-transparent text-ink-600 dark:text-ink-300 border border-ink-300 dark:border-ink-700",
  };

  const dotClasses = {
    default: "bg-ink-400 dark:bg-ink-500",
    sage: "bg-emerald-500 dark:bg-emerald-400",
    highlight: "bg-amber-500 dark:bg-highlight",
    indigo: "bg-indigo-500 dark:bg-indigo-400",
    coral: "bg-red-500 dark:bg-red-400",
    outline: "bg-ink-400",
  };

  return (
    <span
      className={`${base} ${sizeClasses[size] || sizeClasses.md} ${
        variantClasses[variant] || variantClasses.default
      } ${className}`}
      {...props}
    >
      {dot && (
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            dotClasses[variant] || dotClasses.default
          }`}
        />
      )}
      {children}
    </span>
  );
}

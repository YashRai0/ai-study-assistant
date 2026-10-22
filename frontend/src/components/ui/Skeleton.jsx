import React from "react";

/**
 * Standard Prepnexia Design System Skeleton
 */
export default function Skeleton({ className = "", ...props }) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-ink-200/60 dark:bg-ink-800/60 ${className}`}
      {...props}
    />
  );
}

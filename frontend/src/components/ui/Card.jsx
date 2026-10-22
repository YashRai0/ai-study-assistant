import React from "react";

/**
 * Standard Prepnexia Design System Card Surface
 * Padding: none | sm | md | lg
 */
export default function Card({
  children,
  padding = "md",
  className = "",
  hover = false,
  as: Component = "div",
  ...props
}) {
  const paddingClasses = {
    none: "",
    sm: "p-4",
    md: "p-6",
    lg: "p-8",
  };

  const hoverEffect = hover
    ? "transition-all duration-200 hover:shadow-md hover:border-ink-200 dark:hover:border-ink-700"
    : "";

  return (
    <Component
      className={`rounded-2xl border border-ink-100 bg-white dark:bg-[#1b233a] dark:border-[#273352] text-ink-900 dark:text-ink-50 shadow-2xs ${
        paddingClasses[padding] || paddingClasses.md
      } ${hoverEffect} ${className}`}
      {...props}
    >
      {children}
    </Component>
  );
}

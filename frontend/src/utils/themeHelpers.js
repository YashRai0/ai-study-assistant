/**
 * Theme resolution and switching helpers
 */

export function resolveInitialTheme(storedTheme, systemPrefersDark = false) {
  if (storedTheme === "dark" || storedTheme === "light") {
    return storedTheme;
  }
  return systemPrefersDark ? "dark" : "light";
}

export function getNextTheme(currentTheme) {
  return currentTheme === "dark" ? "light" : "dark";
}

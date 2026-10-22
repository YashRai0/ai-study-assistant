import test from "node:test";
import assert from "node:assert/strict";
import { resolveInitialTheme, getNextTheme } from "../src/utils/themeHelpers.js";

test("resolveInitialTheme respects stored preferences over system preference", () => {
  assert.equal(resolveInitialTheme("dark", false), "dark");
  assert.equal(resolveInitialTheme("light", true), "light");
});

test("resolveInitialTheme falls back to system preference when stored preference is null or invalid", () => {
  assert.equal(resolveInitialTheme(null, true), "dark");
  assert.equal(resolveInitialTheme(null, false), "light");
  assert.equal(resolveInitialTheme("auto", true), "dark");
  assert.equal(resolveInitialTheme("auto", false), "light");
});

test("getNextTheme toggles back and forth cleanly", () => {
  assert.equal(getNextTheme("light"), "dark");
  assert.equal(getNextTheme("dark"), "light");
});

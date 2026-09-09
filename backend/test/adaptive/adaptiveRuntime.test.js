import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Extracts the string literal argument of every `.select("...")` call in a
// source file, so we can check what fields are (and aren't) projected
// without pinning the test to one exact, brittle field-order string.
function selectArgs(source) {
  return [...source.matchAll(/\.select\("([^"]*)"\)/g)].map((m) => m[1]);
}

function words(selectArg) {
  return selectArg.split(/\s+/).filter(Boolean);
}

test("adaptive runtime does not project diagnostic answers", () => {
  const source = fs.readFileSync(new URL("../../src/services/adaptiveRuntime.js", import.meta.url), "utf8");
  const diagnosticSelects = selectArgs(source).filter((s) => s.includes("conceptIds") && s.includes("question"));
  assert.ok(diagnosticSelects.length > 0, "expected at least one diagnostic-question select() in adaptiveRuntime.js");
  for (const s of diagnosticSelects) {
    for (const field of ["question", "type", "options", "difficulty", "cognitiveLevel"]) {
      assert.ok(words(s).includes(field), `expected "${field}" to be selected`);
    }
    assert.ok(!words(s).includes("answer"), `"answer" must never be selected here — leaked select() was: ${s}`);
  }
});

test("learning route excludes diagnostic answer field", () => {
  const source = fs.readFileSync(new URL("../../src/routes/learning.js", import.meta.url), "utf8");
  const diagnosticSelects = selectArgs(source).filter((s) => s.includes("conceptIds") && s.includes("question"));
  assert.ok(diagnosticSelects.length > 0, "expected at least one diagnostic-question select() in routes/learning.js");
  for (const s of diagnosticSelects) {
    for (const field of ["question", "type", "options", "difficulty", "cognitiveLevel"]) {
      assert.ok(words(s).includes(field), `expected "${field}" to be selected`);
    }
    assert.ok(!words(s).includes("answer"), `"answer" must never be selected here — leaked select() was: ${s}`);
  }
});

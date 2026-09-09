import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("durable attempt derives correctness server-side", () => {
  const source = fs.readFileSync(new URL("../../src/routes/learning.js", import.meta.url), "utf8");
  const durable = source.slice(source.indexOf('router.post("/attempts/durable"'));
  assert.match(durable, /evaluateQuestionAnswer/);
  assert.doesNotMatch(durable, /req\.body\.correct/);
  assert.doesNotMatch(durable, /req\.body\.score/);
});

test("diagnostic endpoints do not select answer", () => {
  const source = fs.readFileSync(new URL("../../src/routes/learning.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\.select\([^)]*\banswer\b/);
});

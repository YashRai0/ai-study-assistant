import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { extractAndValidateJson } from "../src/utils/parseJson.js";

const flashcardSchema = z.array(z.object({ front: z.string(), back: z.string() })).min(1);

describe("extractAndValidateJson", () => {
  test("parses clean JSON directly", () => {
    const raw = JSON.stringify([{ front: "Q", back: "A" }]);
    const result = extractAndValidateJson(raw, flashcardSchema, { arrayBracket: true });
    assert.equal(result.success, true);
    assert.deepEqual(result.data, [{ front: "Q", back: "A" }]);
  });

  test("strips a ```json fence before parsing", () => {
    const raw = '```json\n[{"front": "Q", "back": "A"}]\n```';
    const result = extractAndValidateJson(raw, flashcardSchema, { arrayBracket: true });
    assert.equal(result.success, true);
    assert.deepEqual(result.data, [{ front: "Q", back: "A" }]);
  });

  test("strips a bare ``` fence (no json label)", () => {
    const raw = '```\n[{"front": "Q", "back": "A"}]\n```';
    const result = extractAndValidateJson(raw, flashcardSchema, { arrayBracket: true });
    assert.equal(result.success, true);
  });

  test("recovers JSON from prose the model added despite instructions", () => {
    const raw = 'Sure! Here are your flashcards:\n[{"front": "Q", "back": "A"}]\nHope that helps!';
    const result = extractAndValidateJson(raw, flashcardSchema, { arrayBracket: true });
    assert.equal(result.success, true);
    assert.deepEqual(result.data, [{ front: "Q", back: "A" }]);
  });

  test("fails cleanly (not a crash) on malformed JSON", () => {
    const raw = "[{ front: Q, back: A }]"; // unquoted keys — invalid JSON
    const result = extractAndValidateJson(raw, flashcardSchema, { arrayBracket: true });
    assert.equal(result.success, false);
  });

  test("fails when JSON is valid but doesn't match the required shape", () => {
    const raw = JSON.stringify([{ question: "Q", answer: "A" }]); // wrong keys
    const result = extractAndValidateJson(raw, flashcardSchema, { arrayBracket: true });
    assert.equal(result.success, false);
    assert.equal(result.reason, "shape_mismatch");
  });

  test("fails when the model returns nothing resembling JSON", () => {
    const raw = "I don't have enough information to generate flashcards.";
    const result = extractAndValidateJson(raw, flashcardSchema, { arrayBracket: true });
    assert.equal(result.success, false);
    assert.equal(result.reason, "no_json_found");
  });

  test("rejects an empty array (schema requires at least one card)", () => {
    const raw = "[]";
    const result = extractAndValidateJson(raw, flashcardSchema, { arrayBracket: true });
    assert.equal(result.success, false);
  });
});

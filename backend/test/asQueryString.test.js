import test from "node:test";
import assert from "node:assert/strict";
import { asQueryString } from "../src/utils/asQueryString.js";

test("passes a plain string through unchanged", () => {
  assert.equal(asQueryString("Biology"), "Biology");
});

test("rejects an injected operator object, returning the fallback instead", () => {
  // This is what req.query.subject becomes for a request like
  // ?subject[$ne]=null — Express's query parser turns bracket syntax into
  // a nested object, not a string.
  const injected = { $ne: null };
  assert.equal(asQueryString(injected, "All subjects"), "All subjects");
  assert.equal(asQueryString(injected), undefined);
});

test("rejects an array (repeated query param), returning the fallback", () => {
  assert.equal(asQueryString(["Biology", "Chemistry"], "All subjects"), "All subjects");
});

test("rejects undefined/missing values, returning the fallback", () => {
  assert.equal(asQueryString(undefined, "All subjects"), "All subjects");
  assert.equal(asQueryString(undefined), undefined);
});

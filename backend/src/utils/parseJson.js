// Robust parsing for LLM outputs that were asked to "return ONLY JSON".
// Models occasionally ignore that instruction and wrap the JSON in prose or
// markdown fences, or return a malformed/incomplete structure — a bare
// JSON.parse() on that crashes the request. This extracts the JSON block if
// needed, then validates its *shape* against a Zod schema before the route
// trusts it, instead of assuming parse-success means well-formed.
export function extractAndValidateJson(raw, schema, { arrayBracket = false } = {}) {
  // Strip a leading/trailing ```json or ``` fence if the model wrapped its
  // output in one despite being told not to — cheap to do up front, and it
  // keeps the regex fallback below matching cleaner JSON in the common case
  // (e.g. "Sure! ```json\n[...]\n```" instead of raw prose-wrapped JSON).
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let parsed;

  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Still didn't parse cleanly — e.g. "Sure! Here's the JSON:\n[...]" with
    // no fences at all. Fall back to grabbing the first {...} or [...] block.
    const pattern = arrayBracket ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/;
    const match = cleaned.match(pattern);
    if (!match) return { success: false, reason: "no_json_found" };
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return { success: false, reason: "malformed_json" };
    }
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    return { success: false, reason: "shape_mismatch", issues: result.error.errors };
  }

  return { success: true, data: result.data };
}

/**
 * Express's default query parser (qs) turns `?field[$ne]=null` into
 * `req.query.field = { $ne: null }` — an object, not a string. If that
 * value is then dropped straight into a Mongoose filter (`{ subject: value
 * }`), it becomes a MongoDB operator instead of a value being matched
 * against, letting a request bend a filter it was never supposed to
 * control (classic NoSQL operator injection, CWE-943).
 *
 * Use this anywhere a value read from req.query is going into a Mongo
 * filter: it passes plain strings through unchanged and turns anything
 * else (objects, arrays) into the fallback, so an injected operator just
 * fails to match instead of being evaluated as a query operator.
 */
export function asQueryString(value, fallback = undefined) {
  return typeof value === "string" ? value : fallback;
}

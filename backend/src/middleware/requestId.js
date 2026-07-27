import crypto from "crypto";

// Attaches a short request ID to every request so log lines from the same
// request can be correlated — without this, concurrent requests' errors are
// indistinguishable in the console.
export function requestId(req, res, next) {
  req.id = crypto.randomUUID().slice(0, 8);
  res.setHeader("x-request-id", req.id);
  next();
}

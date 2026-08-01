import mongoose from "mongoose";

// Confirmed root cause of a real production crash (Railway logs, 2026-07):
// several routes did `Model.findOne({ _id: req.params.someId, ... })` with no
// check that someId actually looks like a MongoDB ObjectId first. A
// malformed value (seen in production as the literal string "undefined" —
// almost certainly from a frontend bug building a URL with a missing ID)
// makes Mongoose throw a CastError while casting the query filter. That
// throw happened outside any try/catch in the route handler, so it became
// an unhandled promise rejection — which, since Node 15, terminates the
// whole process by default. One bad request crashed the entire app for
// every user, not just the one making that request.
//
// Using Express's router.param() means this runs automatically for any
// route on a router that declares a `:paramName` segment, without needing
// to remember to add a check to every individual handler — including ones
// added later.
export function validateObjectIdParam(req, res, next, value, name) {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return res.status(400).json({ error: `Invalid ${name}.` });
  }
  next();
}

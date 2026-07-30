// Validates required environment variables exist before the server starts
// accepting traffic. Without this, a missing JWT_SECRET or GROQ_API_KEY
// doesn't fail at boot — it fails later, confusingly, on the first request
// that happens to need it (e.g. the first login attempt throws inside
// jwt.sign with a cryptic error, instead of the deploy log clearly saying
// what's missing before the app ever came online).
//
// Only variables actually read via process.env elsewhere in the backend are
// checked here (see auth.js, middleware/auth.js, llm.js, voice.js,
// db/mongoose.js) — this list should stay in sync with those call sites.
const REQUIRED_ENV_VARS = ["JWT_SECRET", "GROQ_API_KEY", "MONGODB_URI"];

function validateEnv() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    // Deliberately console.error (not the pino logger) — this can run
    // before logger setup is guaranteed to be ready, and it must be visible
    // even if logging itself is misconfigured.
    console.error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        "The server will not start without these. Check your .env file (see .env.example) " +
        "or your hosting platform's environment variable settings."
    );
    process.exit(1);
  }
}

// Runs immediately as a side effect of being imported, rather than exporting
// a function the caller has to remember to invoke. This matters because ES
// module imports are hoisted: if this were only an exported function, any
// OTHER import earlier in server.js's dependency graph (e.g. app.js, which
// pulls in services/llm.js — and llm.js constructs its Groq client at
// module top-level using process.env.GROQ_API_KEY) would still fully
// evaluate before a later `validateEnv()` call ever ran, defeating the
// point. Self-running at import time means this only protects the vars it
// checks if THIS import line comes first in server.js, before app.js.
validateEnv();
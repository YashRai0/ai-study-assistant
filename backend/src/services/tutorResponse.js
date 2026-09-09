// Thin re-export for callers expecting this path. The actual
// implementation lives in llm.js alongside every other LLM-calling
// function (generateSummary, generateFlashcards, evaluateFreeResponse,
// etc.) — that's where `complete()`, JSON-extraction, and the
// untrusted-content prompt guard already live, so a structured tutor
// response is built from those instead of a separate ad hoc
// implementation calling a function (`generateChatCompletion`) that
// didn't actually exist anywhere in llm.js.
export { generateStructuredTutorResponse } from "./llm.js";

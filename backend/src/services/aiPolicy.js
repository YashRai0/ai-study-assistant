// Central AI Task Policy: defines model, reasoning effort, explicit token
// budgets, temperature, and prompt versions per AI task.
// Step 3 & Step 16 & Step 18: Never treat every LLM call equally, never rely on
// model defaults, and ensure every structured and unstructured operation has
// bounded output tokens and versioned prompts.

export const DEFAULT_MODEL = "openai/gpt-oss-20b";
export const MAX_OUTPUT_TOKENS_CEILING = 4096;

export const AI_TASK_POLICY = Object.freeze({
  chat: {
    model: DEFAULT_MODEL,
    reasoningEffort: "medium",
    maxTokens: 1500,
    temperature: 0.3,
    promptVersion: "chat:v1",
    jsonMode: false,
    cacheable: false,
  },
  simple_explanation: {
    model: DEFAULT_MODEL,
    reasoningEffort: "low",
    maxTokens: 400,
    temperature: 0.3,
    promptVersion: "explain:v1",
    jsonMode: false,
    cacheable: true,
    ttlSeconds: 86400, // 24 hours
  },
  summary: {
    model: DEFAULT_MODEL,
    reasoningEffort: "low",
    maxTokens: 1200,
    temperature: 0.3,
    promptVersion: "summary:v1",
    jsonMode: false,
    cacheable: true,
    ttlSeconds: 86400,
  },
  flashcards: {
    model: DEFAULT_MODEL,
    reasoningEffort: "low",
    maxTokens: 2000,
    temperature: 0.3,
    promptVersion: "flashcards:v1",
    jsonMode: true,
    cacheable: true,
    ttlSeconds: 86400,
  },
  quiz_generation: {
    model: DEFAULT_MODEL,
    reasoningEffort: "low",
    maxTokens: 2500,
    temperature: 0.3,
    promptVersion: "quiz:v1",
    jsonMode: true,
    cacheable: true,
    ttlSeconds: 86400,
  },
  concept_extraction: {
    model: DEFAULT_MODEL,
    reasoningEffort: "low",
    maxTokens: 3000,
    temperature: 0.2,
    promptVersion: "concepts:v1",
    jsonMode: true,
    cacheable: true,
    ttlSeconds: 86400,
  },
  diagnostic_generation: {
    model: DEFAULT_MODEL,
    reasoningEffort: "medium",
    maxTokens: 3000,
    temperature: 0.3,
    promptVersion: "diagnostic:v1",
    jsonMode: true,
    cacheable: true,
    ttlSeconds: 86400,
  },
  tutor_intervention: {
    model: DEFAULT_MODEL,
    reasoningEffort: "medium",
    maxTokens: 1200,
    temperature: 0.4,
    promptVersion: "tutor:v1",
    jsonMode: true,
    cacheable: false, // live conversation with student
  },
  eval_free_response: {
    model: DEFAULT_MODEL,
    reasoningEffort: "low",
    maxTokens: 800,
    temperature: 0.1,
    promptVersion: "eval_free_response:v1",
    jsonMode: true,
    cacheable: false, // student-specific answer evaluation
  },
  rerank: {
    model: DEFAULT_MODEL,
    reasoningEffort: "low",
    maxTokens: 1000,
    temperature: 0.1,
    promptVersion: "rerank:v1",
    jsonMode: true,
    cacheable: true,
    ttlSeconds: 3600, // 1 hour for identical query + candidate pool
  },
  misconception_risk: {
    model: DEFAULT_MODEL,
    reasoningEffort: "medium",
    maxTokens: 1200,
    temperature: 0.2,
    promptVersion: "misconception:v1",
    jsonMode: true,
    cacheable: false,
  },
  compression_segment: {
    model: DEFAULT_MODEL,
    reasoningEffort: "low",
    maxTokens: 1000,
    temperature: 0.2,
    promptVersion: "compression:v1",
    jsonMode: false,
    cacheable: true,
    ttlSeconds: 86400 * 7, // 7 days for document segment intermediate compression
  },
});

/**
 * Returns the policy configuration for a named operation, merged with any
 * explicit caller overrides.
 */
export function getTaskPolicy(operation, overrides = {}) {
  const base = AI_TASK_POLICY[operation] || {
    model: DEFAULT_MODEL,
    reasoningEffort: "low",
    maxTokens: 2048,
    temperature: 0.3,
    promptVersion: "generic:v1",
    jsonMode: false,
    cacheable: false,
  };
  return { ...base, ...overrides, operation };
}

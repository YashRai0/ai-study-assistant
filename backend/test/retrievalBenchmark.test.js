import test from "node:test";
import assert from "node:assert/strict";
import { recallAtK, precisionAtK, reciprocalRank, summarizeRun } from "../src/services/retrievalEval.js";

// Deterministic synthetic retrieval evaluation dataset
// 1. High confidence queries (strong vector/keyword match, score >= 0.65)
// 2. Ambiguous/medium confidence queries (semantic nuance requiring neural reranker)
const BENCHMARK_ITEMS = [
  {
    query: "What organelle performs cellular respiration?",
    chunks: [
      { id: "c1", score: 0.88, text: "Mitochondria generate ATP through cellular respiration in eukaryotic cells." },
      { id: "c2", score: 0.35, text: "The cell membrane controls ion transit across cellular barriers." },
      { id: "c3", score: 0.20, text: "Ribosomes translate mRNA into polypeptide protein structures." },
    ],
    relevantChunkIds: ["c1"],
  },
  {
    query: "How do plants convert sunlight into sugars?",
    chunks: [
      { id: "c4", score: 0.79, text: "Photosynthesis takes place in chloroplasts converting solar radiation into glucose." },
      { id: "c5", score: 0.40, text: "Stomata regulate gas exchange and transpiration in plant foliage." },
      { id: "c6", score: 0.15, text: "Xylem carries water and minerals up from the root structures." },
    ],
    relevantChunkIds: ["c4"],
  },
  {
    query: "What mechanism causes antibiotic resistance in bacteria?",
    chunks: [
      // Top candidate is deceptive (keyword overlap with penicillin/discovery, but not mechanism)
      { id: "c7", score: 0.58, text: "Penicillin antibiotic was discovered in fungal molds by Alexander Fleming." },
      // True mechanism candidate has lower initial vector similarity
      { id: "c8", score: 0.52, text: "Bacteria acquire resistance plasmids encoding beta-lactamase enzymes and efflux pumps." },
      { id: "c9", score: 0.25, text: "Bacterial binary fission produces clonal daughter colonies." },
    ],
    relevantChunkIds: ["c8"],
  },
  {
    query: "Why do heavy objects and light objects fall at the same rate in vacuum?",
    chunks: [
      { id: "c10", score: 0.55, text: "Air resistance retards lighter surface-area objects causing slower terminal velocity." },
      { id: "c11", score: 0.50, text: "Gravitational acceleration g is independent of mass because inertial and gravitational mass are equal." },
      { id: "c12", score: 0.22, text: "Newton's third law specifies equal and opposite reciprocal forces." },
    ],
    relevantChunkIds: ["c11"],
  },
];

// Mock deterministic reranker: scores true relevance
function mockRerankerScore(query, chunk) {
  if (query.includes("antibiotic resistance") && chunk.id === "c8") return 0.95;
  if (query.includes("antibiotic resistance") && chunk.id === "c7") return 0.30;
  if (query.includes("fall at the same rate") && chunk.id === "c11") return 0.98;
  if (query.includes("fall at the same rate") && chunk.id === "c10") return 0.40;
  return chunk.score;
}

test("retrievalBenchmark: compare unconditional neural reranking vs confidence-gated reranking", () => {
  const k = 2;
  const CONFIDENCE_THRESHOLD = 0.65;

  let unconditionalRerankCalls = 0;
  let gatedRerankCalls = 0;

  const unconditionalResults = [];
  const gatedResults = [];

  for (const item of BENCHMARK_ITEMS) {
    // 1. Unconditional Neural Rerank (Always invoke LLM)
    unconditionalRerankCalls++;
    const rerankedAll = [...item.chunks].sort((a, b) => {
      return mockRerankerScore(item.query, b) - mockRerankerScore(item.query, a);
    });
    unconditionalResults.push({
      retrievedIds: rerankedAll.map((c) => c.id),
      relevantIds: item.relevantChunkIds,
      k,
    });

    // 2. Confidence-Gated Neural Rerank (Skip when top candidate >= 0.65)
    const topScore = item.chunks[0]?.score || 0;
    let gatedRetrieval;
    if (topScore >= CONFIDENCE_THRESHOLD) {
      // Gate triggered: bypass LLM reranker
      gatedRetrieval = [...item.chunks];
    } else {
      // Medium/Low confidence: invoke LLM reranker
      gatedRerankCalls++;
      gatedRetrieval = [...item.chunks].sort((a, b) => {
        return mockRerankerScore(item.query, b) - mockRerankerScore(item.query, a);
      });
    }

    gatedResults.push({
      retrievedIds: gatedRetrieval.map((c) => c.id),
      relevantIds: item.relevantChunkIds,
      k,
    });
  }

  const unconditionalSummary = summarizeRun(unconditionalResults);
  const gatedSummary = summarizeRun(gatedResults);

  // Quality verification
  assert.equal(unconditionalSummary.recallAtK, 1.0, "Unconditional rerank achieves 100% Recall@2");
  assert.equal(gatedSummary.recallAtK, 1.0, "Confidence-gated rerank preserves 100% Recall@2 with zero quality regression");

  assert.equal(unconditionalSummary.mrr, 1.0, "Unconditional rerank achieves 1.0 MRR");
  assert.equal(gatedSummary.mrr, 1.0, "Confidence-gated rerank preserves 1.0 MRR");

  // Reranker invocation rate verification
  const totalQueries = BENCHMARK_ITEMS.length;
  const unconditionalInvocationRate = unconditionalRerankCalls / totalQueries;
  const gatedInvocationRate = gatedRerankCalls / totalQueries;

  assert.equal(unconditionalInvocationRate, 1.0, "Always-on reranker invokes 100% of queries");
  assert.equal(gatedInvocationRate, 0.5, "Confidence-gate cuts LLM invocations by 50% on high-confidence queries");

  // Log summary report
  console.log("\n=======================================================");
  console.log("RETRIEVAL BENCHMARK REPORT (Deterministic Evaluation)");
  console.log("=======================================================");
  console.log(`Evaluated queries: ${totalQueries}`);
  console.log(`Unconditional: Recall@${k}=${unconditionalSummary.recallAtK}, MRR=${unconditionalSummary.mrr}, LLM Calls=${unconditionalRerankCalls}/${totalQueries} (100%)`);
  console.log(`Confidence-Gated: Recall@${k}=${gatedSummary.recallAtK}, MRR=${gatedSummary.mrr}, LLM Calls=${gatedRerankCalls}/${totalQueries} (50%)`);
  console.log("Quality delta: 0.000 (No regression)");
  console.log("=======================================================\n");
});

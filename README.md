# AI Study Assistant

An intelligent, production-hardened AI study coach and Retrieval-Augmented Generation (RAG) platform. Upload lecture slides, textbooks, documents, audio, or YouTube links to chat with verified citations, generate flashcards and quizzes, track concept mastery, and follow an adaptive learning plan tuned to your exam goals.

---

## Key Features

### 1. Multi-Format Note Ingestion & Processing
- **Supported Formats:** PDF, DOCX, PPTX, MP3/WAV Audio (Whisper), and YouTube video transcripts.
- **Automatic OCR Fallback:** Scanned or image-only documents automatically run through OCR extraction (`pdf2pic` + `tesseract.js`).
- **Async Job Pipeline:** All uploads and heavy processing run asynchronously on BullMQ queues (`uploadPdf`, `uploadDocx`, `uploadPptx`, `ingestYoutube`, `uploadAudio`, `embedChunks`, `ocr`, `synthesis`, `learning`, `learningEvent`).
- **Storage:** Metadata, user data, and text chunks stored in MongoDB; original files stored securely via MongoDB GridFS.

### 2. Intelligent RAG & AI Tutor
- **Hybrid Retrieval:** Blends cosine similarity over local embeddings (`@xenova/transformers` / all-MiniLM-L6-v2) with BM25 keyword search and query-coverage heuristic reranking.
- **Confidence Guardrails & Anti-Hallucination:** Classifies retrieval confidence as `HIGH`, `MEDIUM`, or `LOW`. When context is insufficient, the tutor admits uncertainty rather than guessing.
- **Verified Citations:** Assistant responses stream structured source citations (e.g. `📚 Page 4 (85%)`) with interactive excerpt popovers.
- **Real-Time Streaming:** Server-Sent Events (SSE) provide low-latency token streaming with an "Explain Simply" analogy mode.
- **Voice Q&A:** Voice recording transcribed via Groq Whisper (`whisper-large-v3`) with optional text-to-speech audio readouts.
- **Retrieval Evaluation Harness:** Built-in RAG metrics (`recall@K`, `precision@K`, `MRR`) to evaluate and benchmark search strategies.

### 3. Cognitive Adaptive Learning Engine
- **Next Best Action ("What Should I Study Today?"):** Real-time pedagogical recommendations right on the dashboard:
  - ⚠️ *Misconception Repair* (targeting persistent reasoning errors)
  - 🧱 *Foundational Gap* (strengthening weak prerequisites before advanced topics)
  - 📖 *Core Learning Target* (unmastered high-importance syllabus concepts)
  - 🔄 *Spaced Review Due* (counteracting the Ebbinghaus forgetting curve)
- **Knowledge Map with Prerequisite Chains:** Visualizes learning dependencies:
  $$\text{[Prerequisites (Mastery \%)]} \longrightarrow \text{[Current Concept]} \longrightarrow \text{[Unlocks / Dependents (Mastery \%)]}$$
- **Spaced Repetition (SM-2):** Flashcards scheduled with customized SM-2 intervals and retention decay factors.
- **Diagnostic Testing:** Adaptive multi-difficulty diagnostic engine establishing baseline student readiness.
- **Exam Simulator & Readiness:** Aggregates concept mastery against course exam dates to compute an Exam Readiness Score.

### 4. Study Tools & Collaboration
- **Flashcards & Quizzes:** Flip-through flashcards and self-grading quizzes (MCQ, True/False, Short Answer) with feedback.
- **Hierarchical Summaries:** Map-reduce text compression handles 100+ page documents without context window overflow.
- **Collaborative Study Groups:** Form groups, share notes, and participate in shared RAG-grounded group discussions.
- **Analytics & Streak Tracker:** 30-day activity charts, study streaks, and subject-level proficiency scores.

---

## Architecture

```text
Railway / Render / Docker Deployment
├── Express API Server (Node.js ESM, port 5000)
│     ├── Authentication (/api/v1/auth) — Access + Refresh token rotation
│     ├── Ingestion & Files (/api/v1/upload) — GridFS & BullMQ dispatcher
│     ├── RAG Chat (/api/v1/chat, /api/v1/multi-chat) — SSE + Citations
│     ├── Adaptive Learning (/api/v1/learning) — Mastery & Next Action
│     └── Health Monitor (/api/health) — Mongo, Redis & memory health
│
└── BullMQ Background Workers (RUN_WORKERS_IN_PROCESS=true by default)
      ├── uploadPdf (x2), uploadDocx (x2), uploadPptx (x2)
      ├── ingestYoutube (x2), uploadAudio (x2)
      ├── embedChunks (x1), ocr (x1), synthesis (x2)
      └── learning (x1), learningEvent (x4)
            │
            └── Redis (Shared connection singleton)
```

### Zero-Cost In-Process Worker Architecture
- **In-Process Mode (Default):** Runs BullMQ workers inside the API server process (`RUN_WORKERS_IN_PROCESS=true`). This eliminates the need for a separate paid background worker service on free/hobby hosting tiers like Render or Railway.
- **Horizontal Scaling:** Setting `RUN_WORKERS_IN_PROCESS=false` disables in-process workers, allowing you to deploy workers as an independent worker container (`npm run worker`).
- **Job Hardening:** All 10 worker queues use `withJobHardening()` to enforce per-queue timeouts, convert non-retryable errors to BullMQ `UnrecoverableError`, and guard against unhandled promise rejections.
- **Migration Hardening:** Distributed atomic locking (`migrations_lock`), SHA-256 checksum drift warnings, and correct up/down state tracking (`computeAppliedNames`).

---

## Tech Stack

| Layer | Technologies |
|-------|--------------|
| **Frontend** | React 18, Vite, Tailwind CSS, React Router 6, Recharts |
| **Backend** | Node.js (ESM), Express, Pino, Helmet, Zod |
| **Task Queue** | BullMQ, Redis (`ioredis`) |
| **Database & Files** | MongoDB Atlas, Mongoose, GridFS |
| **AI / LLM** | Groq API (`openai/gpt-oss-20b`), Groq Whisper (`whisper-large-v3`) |
| **Embeddings** | `@xenova/transformers` (all-MiniLM-L6-v2 running locally in-process) |
| **Parsing & OCR** | `pdf-parse`, `mammoth`, `jszip`, `youtube-transcript`, `tesseract.js`, `pdf2pic` |

---

## Quick Start (Local Development)

### Prerequisites
- Node.js 18+
- Redis (running locally or via cloud URL)
- MongoDB (running locally or MongoDB Atlas)

### 1. Backend Setup
```bash
cd backend
npm install
cp ../.env.example .env
```

Fill in `.env`:
```env
GROQ_API_KEY=your_groq_api_key_here
JWT_SECRET=your_jwt_secret_min_32_chars
REFRESH_TOKEN_SECRET=your_refresh_token_secret_min_32_chars
MONGODB_URI=mongodb://localhost:27017/ai_study_assistant
REDIS_URL=redis://localhost:6379
RUN_WORKERS_IN_PROCESS=true
```

Run the backend:
```bash
npm run dev
```
Backend runs on `http://localhost:5000`.

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Frontend runs on `http://localhost:5173`.

---

## Docker Compose (Full Stack)

To run the complete stack (MongoDB, Redis, Backend, Worker, Frontend) with a single command:

```bash
docker compose up --build
```
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:5000/api/v1`
- Health Check: `http://localhost:5000/api/health`

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GROQ_API_KEY` | Yes | — | Groq API key for LLM inference and Whisper speech-to-text |
| `JWT_SECRET` | Yes | — | Secret for signing short-lived access tokens (15m) |
| `REFRESH_TOKEN_SECRET` | Yes | — | Secret for signing long-lived refresh tokens (30d) |
| `MONGODB_URI` | Yes | — | MongoDB connection string (Atlas or local) |
| `REDIS_URL` | No | `redis://localhost:6379` | Redis connection string for BullMQ task queues |
| `RUN_WORKERS_IN_PROCESS` | No | `true` | Runs BullMQ workers inside the API server (set `false` if running separate worker) |
| `SIMILARITY_THRESHOLD` | No | `0.3` | Minimum cosine similarity required to trigger note answers |
| `LOG_LEVEL` | No | `info` | Pino log level (`info`, `debug`, `warn`, `error`) |
| `PORT` | No | `5000` | Port for the backend HTTP server |
| `CORS_ORIGIN` | No | `http://localhost:5173` | Allowed frontend origin for CORS |

---

## Testing

The backend includes comprehensive test coverage across 10 test suites (284 automated tests):

```bash
cd backend

# Run all unit and integration tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests
npm run test:integration
```

All pure-function and configuration tests run without requiring live network or database connections.

---

## Database Migrations

Database schema migrations are tracked with distributed locking and checksum drift detection:

```bash
cd backend

# Run pending migrations
node scripts/migrate.js up

# Revert last migration
node scripts/migrate.js down
```

---

## License

MIT

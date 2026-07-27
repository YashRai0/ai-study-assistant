# AI Study Assistant

Full-stack RAG app: upload lecture notes as a PDF, then chat with them, summarize them,
and generate flashcards or quizzes — all grounded in the uploaded material.

## Stack

- **Frontend:** React (Vite) + Tailwind CSS + React Router
- **Backend:** Node.js + Express
- **Auth:** JWT (email + password, bcrypt-hashed) — Phase 2
- **Database & cloud storage:** MongoDB Atlas (free tier) — user accounts, PDF chunks/embeddings,
  chat history, and the original PDF bytes via GridFS. One service covers both "database" and
  "cloud storage" instead of standing up a separate file store. — Phase 2
- **LLM:** Groq API (`llama-3.1-8b-instant`) — free tier, fast inference
- **Speech-to-text:** Groq's hosted Whisper endpoint (`whisper-large-v3`) — Phase 2, reuses the
  same Groq API key already used for chat
- **Text-to-speech:** the browser's built-in SpeechSynthesis API — free, no server round-trip
- **Embeddings:** `@xenova/transformers` (local, in-process, no API key needed)
- **Vector store:** in-memory cosine-similarity search over each PDF's chunks, loaded from Mongo
  per request (v1 simplification — see `backend/src/services/vectorStore.js` for notes on
  swapping in a dedicated vector DB later, useful once you add multi-document/semantic search)

## Setup

### Backend
```bash
cd backend
npm install
cp .env.example .env
# then fill in: GROQ_API_KEY, MONGODB_URI (free cluster at mongodb.com/cloud/atlas/register),
# and JWT_SECRET (e.g. `openssl rand -hex 32`)
npm run dev
```
Runs on `http://localhost:5000`.

**OCR system dependencies (local dev only — Railway handles this via `nixpacks.toml`):**
```bash
# macOS
brew install ghostscript graphicsmagick

# Ubuntu/Debian
sudo apt-get install -y ghostscript graphicsmagick
```
Without these, uploading a normal text PDF still works fine — only the OCR fallback for
scanned PDFs needs them.

### Frontend
```bash
cd frontend
npm install
npm run dev
```
Runs on `http://localhost:5173`, proxying `/api` to the backend.

## What's implemented

- Email/password accounts (JWT, bcrypt-hashed passwords) — every PDF, chat, summary, etc. is
  scoped to the logged-in user
- PDF upload → text extraction → chunking (500 words, 50 overlap) → local embeddings → stored in
  MongoDB per user; original PDF bytes stored via GridFS (cloud storage)
- RAG chat, scoped to one selected PDF, with an explicit "not found in your notes" fallback;
  chat history persisted per PDF
- Summary generator (short / medium / bullets / exam-notes)
- Flashcard generator (JSON-parsed into a flip-through UI)
- Quiz generator (MCQ + True/False + Short Answer, self-graded objective questions)
- Semantic search across subjects: rank chunks from *all* of a user's PDFs by meaning (not
  keyword match), optionally filtered to one subject; each PDF is tagged with a subject at
  upload time (defaults to "General")
- OCR for scanned/image-only PDFs: text extraction falls back to OCR (pdf2pic + tesseract.js)
  automatically when a PDF has no text layer; the UI flags which PDFs were OCR'd
- Multi-document chat: converse across ALL of a user's PDFs at once (optionally scoped to one
  subject), with the assistant citing which document(s) an answer draws from when it pulls from
  more than one source. Separate conversation history per scope, same as single-PDF chat keeps
  history per PDF.
- Voice-based Q&A: tap the mic in either chat page to record a question (transcribed via Groq
  Whisper), and optionally toggle "Read answers aloud" to have responses spoken back via the
  browser's built-in text-to-speech
- Explicit error handling for oversized files, non-PDF files, and PDFs where even OCR can't
  extract meaningful text (e.g. blank or extremely low-quality scans)

## Copywriting & SEO (Home page)

- **Copy approach:** every feature description names a concrete outcome ("compress 50 pages
  into one," "quiz yourself before the exam does") instead of generic AI marketing language
  ("powerful," "cutting-edge," "revolutionary"). Active voice throughout; the interface's own
  labels ("Send," "Generate summary," "Check my answers") match what they produce, so the
  vocabulary stays consistent between the landing page and the app.
- **SEO basics covered:** unique `<title>` and meta description in `index.html` (what search
  engines see on first load) plus per-route `<Helmet>` tags on the Home page for when you add
  server-side rendering or more public pages later, one `<h1>` per page, semantic heading
  hierarchy, `robots.txt`, `sitemap.xml`, Open Graph + Twitter card tags for link previews,
  and a `rel="canonical"` tag.
- **Before launch:** replace `your-domain.example` in `index.html`, `robots.txt`, and
  `sitemap.xml` with your real domain, and add a real `og-image.png` (1200×630) to `public/`.

## Known limitations

- OCR requires Ghostscript + GraphicsMagick installed on the machine running the backend (see
  Setup below for local install commands; `backend/nixpacks.toml` handles this on Railway).
  Without them, scanned-PDF uploads will fail with a clear OCR error even though normal
  text PDFs work fine
- OCR runs page-by-page and can be slow on long scanned documents — there's no progress bar,
  just a "give it a moment" message
- Multi-document chat retrieves top-6 chunks across the whole scope per question — with a large
  number of PDFs under one subject, very specific questions may still do better in that PDF's
  own single-document chat
- Voice input needs microphone access and a browser that supports `MediaRecorder`
  (all modern browsers do); it's served over HTTPS in production (Vercel gives you this by
  default), since browsers block mic access on plain HTTP except on localhost
- Text-to-speech quality/voice selection depends entirely on the browser/OS — there's no way to
  control which voice is used from the app
- No password reset flow yet — this is intentionally minimal auth, not production-hardened

All five Phase 2 items from the roadmap (user accounts + cloud storage, multi-document search,
semantic search across subjects, voice-based Q&A, OCR) are now implemented. Phase 3 items —
study plans, spaced repetition, analytics, collaborative groups, mobile app — remain unbuilt.

## Security & robustness fixes (post code-review)

A code review surfaced 10 bugs/risks and 7 architectural suggestions. Fixed here:

- **Rate limiting** (`express-rate-limit`): a general limiter on every request, a strict one on
  login/register (brute-force protection), and a per-user limiter on all Groq-calling and
  upload endpoints (protects API quota from being exhausted by a script or one bad actor).
- **Prompt injection defense**: every LLM call that injects PDF-derived text now includes an
  explicit instruction that the notes content is untrusted data, not commands — a PDF containing
  text like "ignore previous instructions" won't be followed as one.
- **Input validation** (Zod): request bodies for auth, chat, multi-chat, summary, flashcards,
  quiz, and search are now schema-validated instead of relying on manual `if` checks.
- **Robust LLM JSON parsing**: flashcard/quiz responses are now validated against a Zod schema
  after parsing (`src/utils/parseJson.js`) — a malformed or off-shape response returns a clear
  502 error instead of silently returning `[]` or a half-built object to the UI.
- **PDF lifecycle**: `DELETE /api/upload/:pdfId` removes the GridFS file, the Mongo document,
  and its chat history (previously nothing was ever deleted — storage only grew). Duplicate
  uploads are now rejected via a SHA-256 hash of the file bytes, per user.
- **File-type check**: uploads are now checked for the actual PDF magic bytes (`%PDF-`), not just
  the client-reported MIME type, which can be spoofed by renaming any file to `.pdf`.
- **Citations**: chat, multi-document chat, and search now cite the page number (and filename,
  for cross-document answers) a piece of context came from. This required reworking PDF parsing
  and chunking to track text per-page instead of as one continuous stream — chunks no longer
  span page boundaries as a result.
- **Chat history growth**: history queries are now capped at 500 messages as an interim guard;
  full pagination isn't built yet (see below).

**Deliberately not done in this pass** (larger architectural changes, not simple fixes):
streaming responses, a semantic cache for repeated questions, background/async embedding jobs
for large PDFs, and hybrid (BM25 + vector) search. Also not done: switching multer from memory
to disk storage — `pdf-parse` and the embedding model both need the full buffer in memory
regardless, so the memory-usage win from disk storage alone is small relative to the added
complexity; worth revisiting if large concurrent uploads become a real bottleneck.

## Second round: scalability + remaining review items

A follow-up review caught a real architectural ceiling plus several more correctness issues.

- **⚠️ Recovered a broken intermediate state first**: chunks/embeddings had already been split
  out of the `Pdf` document into their own `Chunk` collection (see below), but three route files
  (`chat.js`, `multiChat.js`, `search.js`) still referenced the old embedded `chunks` array, and
  had a duplicate `import { aiLimiter }` line each — a syntax error that would have prevented the
  server from starting at all. Fixed both before touching anything else; every backend file now
  passes `node --check`, and all relative import paths were verified to resolve.
- **Chunks/embeddings in their own collection**: previously embedded inside the `Pdf` document,
  which risked approaching MongoDB's 16MB document limit on a long PDF and forced every metadata
  query to load embedding data it didn't need. Now a separate `Chunk` collection (one document
  per chunk, `pdf`/`owner`/`subject` denormalized onto it for fast filtering), with `Pdf` keeping
  just a `chunkCount` number. `chat.js`, `multiChat.js`, and `search.js` now query `Chunk`
  directly and only pull the fields they need.
- **Similarity threshold**: chat and multi-document chat now check the best retrieved match's
  score before answering — below `SIMILARITY_THRESHOLD` (0.3, an untuned starting point for
  all-MiniLM-L6-v2 — see `vectorStore.js`), the response is "I couldn't find this information in
  your uploaded notes" without a wasted LLM call, instead of always handing the top-4 chunks to
  the model regardless of how weak the match was. Search intentionally does NOT apply this
  threshold — it's meant to show whatever it finds, ranked, with a score badge.
- **Hierarchical summarization for long PDFs**: `generateSummary`/`generateFlashcards`/
  `generateQuiz` now compress text above ~6000 words via map-reduce (summarize each segment,
  then work from the combined intermediate summaries) before generating, instead of risking
  context-window overflow on a 100+ page PDF's raw full text.
- **JSON parsing**: explicit markdown code-fence stripping added on top of the existing
  regex-extraction fallback, so a response like `` ```json\n[...]\n``` `` or "Sure! [...]" both
  parse cleanly.
- **GridFS download error handling**: the PDF-file-streaming route now has an `.on("error", ...)`
  handler instead of piping straight through with no failure path.

**Still deliberately deferred, with reasoning**:
- **Real ANN vector index** (issue: in-memory search is O(n log n)) — correct for this project's
  scale (hundreds to low thousands of chunks), the wrong architecture at tens of thousands. Fixing
  this properly means standing up and operating a real vector index (pgvector, a hosted
  ChromaDB/Pinecone, etc.), which is a new service to deploy and keep in sync, not a code change.
- **Cross-user embedding cache** — per-user duplicate detection (SHA-256 hash) is already in
  place; caching embeddings *across* different users' uploads of the same file raises its own
  question (should another student's embeddings silently back yours?) worth a deliberate answer,
  not a quiet optimization.
- **Streaming responses, background embedding jobs/queue, refresh tokens/token rotation, API
  versioning (`/api/v1`), consolidating chat into one document per exchange** — each is a real
  improvement but a structural one (new infra, a breaking route/schema change, or meaningfully
  more moving parts), not a bug fix. Chat history growth already has an interim cap (500
  messages) from the previous round.
- **CORS** — already restricted to `CORS_ORIGIN` from env, not wildcarded; just a reminder to
  never set that to `*` in production.

## Third round: transaction safety, OCR limits, security headers, tests

- **Upload transaction safety**: `Pdf.create` + `Chunk.insertMany` now run inside a MongoDB
  transaction (supported on Atlas, since it's always deployed as a replica set) — if chunk
  insertion fails partway through, the Pdf document is rolled back too, instead of leaving an
  orphaned Pdf with no chunks. GridFS writes happen outside the transaction (GridFS spans two
  collections and large uploads can hit transaction size limits), so on any failure after the
  GridFS write, the file is explicitly deleted as a compensating action.
- **OCR DoS protection**: OCR now refuses PDFs over 30 pages (`MAX_OCR_PAGES` in
  `pdfParser.js`) and has a 3-minute hard timeout. Honest caveat, documented in the code: the
  timeout bounds how long the HTTP request waits, but tesseract.js recognition isn't cleanly
  abortable mid-page, so a truly hostile file could still consume some CPU in the background
  after the request has already failed — the page limit is what prevents the worst cases.
- **Filename sanitization**: uploaded filenames are now normalized (Unicode NFC), stripped of
  control characters, and path separators are replaced — before being stored or displayed.
- **Security headers**: added `helmet` (CSP, X-Frame-Options, X-Content-Type-Options, etc.) —
  appropriate as-is for an API-only backend with no server-rendered HTML.
- **Structured logging**: replaced scattered `console.error` calls with a real logger (`pino`) —
  every line is JSON with a level and timestamp. A `requestId` middleware tags every request
  with a short ID (returned as `x-request-id`) so related log lines can be correlated.
- **API versioning**: all routes now live under `/api/v1/...` instead of `/api/...`, so a future
  breaking change can be added as `/api/v2` alongside it rather than breaking existing clients.
  Frontend's `client.js` default `baseURL` updated to match.
- **Automated tests**: added `backend/test/` with unit tests (Node's built-in test runner, no
  extra dependency) for the pure-logic pieces: JSON extraction/validation (fence-stripping,
  prose recovery, malformed input, shape validation), the vector-store ranking + similarity
  threshold, page-aware chunking, and filename sanitization. Run with `npm test` from
  `backend/`. **I actually ran these** in this sandbox (Node is available here, unlike most of
  this project's other dependencies) — 23/23 pass for the three suites with no external
  dependencies (`vectorStore`, `chunker`, `sanitizeFilename`); the `parseJson` suite needs the
  real `zod` package to run (unavailable offline here), so I verified its underlying logic
  separately with a hand-rolled mock schema and all 8 cases passed. One test genuinely caught a
  bug — in my own test assertion, not the code — which I fixed before finalizing.
- **Also recovered a broken state before starting**: three route files had literal duplicate
  `import { aiLimiter }` lines (a hard syntax error) left over from an interrupted earlier edit.
  Fixed first; every backend file passes `node --check` and all relative imports resolve.

**Acknowledged, not changed**: embeddings living in MongoDB (issue 1) and page-based rather than
semantic chunking (issue 7) are both already covered by earlier notes in this file — acceptable
at this project's scale, real fixes are architecture changes (a dedicated vector index; semantic
chunking) rather than bugs.

**Still deliberately deferred**: response streaming (raised in all three review rounds now —
happy to build this next if you want it), background/async embedding jobs, refresh tokens/token
rotation, and consolidating chat into one document per exchange. Indexing-progress UI and
conversation titles are noted as "polish," not implemented.

## Fourth round

A follow-up review repeated three items from round 3 (memory storage, OCR limits, transactions)
— checking the actual code first, OCR limits and transactions were already fixed and unchanged;
memory storage was a genuine repeat (I'd deferred it twice with reasoning) and is fixed now,
given the third flag with concrete numbers. Also fixed several smaller, genuinely new items:

- **Disk storage instead of memory storage**: `multer` now streams uploads straight to a temp
  file (`os.tmpdir()`) instead of buffering the whole file in Node's process memory as it's
  received. `pdf-parse` still needs one full in-memory Buffer to run — that's unavoidable — but
  now it's read from disk transiently during processing (one file at a time, in already-
  serialized route logic) rather than N concurrent uploads each holding a full buffer just from
  receiving the HTTP request. The temp file is always removed in a `finally` block.
- **Heap-based top-k retrieval**: `retrieveTopK` now uses a bounded min-heap (O(n log k)) instead
  of sorting every scored chunk and slicing (O(n log n)) — meaningful once k (4-8) is much
  smaller than the chunk count. Existing vectorStore tests re-run unchanged and all pass,
  confirming the rewrite is behavior-preserving.
- **Configurable similarity threshold**: `SIMILARITY_THRESHOLD` now reads from an optional env
  var (falls back to the same 0.3 default) instead of being a hardcoded constant.
- **Cleaner handling of malformed PDFs**: the `%PDF-` magic-byte check only catches renamed
  non-PDFs, not files that are structurally corrupted past that header. `pdf-parse` itself is
  now wrapped in its own try/catch with a specific "this PDF appears corrupted" message (400)
  instead of falling through to a generic 500.
- **Request ID consistency**: audited every `logger.error`/`logger.info` call — found one gap
  (`pdfParser.js`'s OCR-failure log, a service function with no direct `req` access) and threaded
  `req.id` through as an optional parameter so it's included there too.
- **Explicit CSP decision**: Helmet's CSP is now explicitly disabled with a documented reason
  (this backend only returns JSON, never renders HTML, so a CSP header restricts nothing
  meaningful) rather than silently inheriting HTML-oriented defaults that don't apply here.

**Not done, with reasoning**:
- **Integration tests** (upload/login/chat) — these need a real or in-memory MongoDB plus
  `supertest`, neither of which I can install or run in this sandbox (no network access here).
  Writing them without being able to run them risks shipping tests that look plausible but don't
  actually pass — worth doing locally where you can verify them, rather than from me blind.
- **Worker pool for OCR** — the page limit + timeout from round 3 cover the acute DoS risk;
  a real worker pool (separate processes that can be killed outright, work queue) is the same
  category as the job-queue/background-processing items already deferred above.
- **Streaming** — now raised in every review round. Still not implemented, since it's a genuine
  feature (SSE or WebSocket plumbing through both the Groq call and both chat UIs) rather than a
  bounded fix, and this response was already covering a lot of ground. If you want it, it's a
  good candidate for a focused, dedicated pass next rather than one more bullet in a bug-fix list.

## Streaming responses (dedicated pass)

Both single-PDF chat and multi-document chat now stream tokens as they're generated instead of
waiting for the full response:

- **Backend**: `chat.js` and `multiChat.js` respond with Server-Sent Events
  (`Content-Type: text/event-stream`) — each event is `data: {"token": "..."}\n\n`, ending with
  `data: {"done": true}\n\n"`, or `data: {"error": "..."}\n\n"` if generation fails mid-stream.
  `llm.js` was refactored so every prompt (`answerFromNotes`, `explainSimply`,
  `answerAcrossNotes`) has its system/user prompt built once by a shared helper function, with
  both a non-streaming and a streaming variant calling that same helper — so the two can't drift
  out of sync with each other as the prompts evolve. The similarity-threshold check (from an
  earlier round) still runs before generation starts either way: a weak match still short-
  circuits to "couldn't find this" without spending a Groq call, streamed as a single token.
- **Frontend**: a shared `streamChatRequest` helper (`api/streamChat.js`) uses raw `fetch` +
  `ReadableStream`, not axios or the native `EventSource` API — axios doesn't expose incremental
  chunks the way this needs in the browser, and `EventSource` only supports GET requests, not a
  POST with a JSON body. Both `Chat.jsx` and `MultiChat.jsx` now show the assistant's message
  filling in progressively instead of a "Thinking..." placeholder that's replaced all at once.
  Voice read-aloud still works — it just waits for the stream to finish before speaking the full
  answer, since reading partial sentences aloud as they arrive would be worse UX, not better.
- Flashcards, quiz, and summary generation are NOT streamed — those return one structured
  JSON/array response the UI renders as a whole (a flashcard flips, a quiz question is scored),
  where a token-by-token typing effect wouldn't add anything; streaming is specifically about
  conversational chat responses.

## Phase 3: Performance analytics dashboard

The first Phase 3 feature — a dashboard of study activity and quiz performance at `/analytics`.

- **New data captured**: quiz results weren't persisted anywhere before this (only generated and
  graded client-side). A `QuizAttempt` model now records `{ owner, pdf, subject, score, total,
  takenAt }`, saved via a new `POST /api/v1/quiz/:pdfId/attempts` endpoint that `Quiz.jsx` calls
  right after "Check my answers" grades the objective (MCQ + True/False) questions client-side.
  This save is best-effort — the score is already shown to the user regardless of whether it
  succeeds, so a failed save doesn't block anything, it just means that attempt won't show up
  in analytics.
- **`GET /api/v1/analytics/summary`** aggregates across `Pdf`, `ChatMessage`, `MultiChatMessage`,
  and `QuizAttempt` for the logged-in user: total PDFs (by subject), total questions asked
  (chat + multi-doc chat combined), quiz attempt count and average score (overall and per
  subject), the 10 most recent quiz attempts, a 30-day daily activity count, and a study streak.
  The streak and daily-activity chart are both bounded by a 30-day query window — a streak
  longer than 30 days will under-report, since the endpoint doesn't look further back than that.
- **Frontend**: `Analytics.jsx` uses `recharts` (new dependency) for a 30-day activity bar chart
  and a quiz-average-by-subject bar chart, plus stat cards and a recent-attempts list. Styled to
  match the existing ink/paper/highlight design system rather than recharts' defaults.
- Chat history growth (from earlier rounds) meant this data was always being collected — this
  feature is really about aggregating and presenting what was already there, plus the one new
  piece (quiz results) that wasn't being saved before.

## Integration tests (upload / login / chat)

Added `backend/test/integration/` — `auth.test.js`, `upload.test.js`, `chat.test.js` — using
`supertest` against the real Express app (`app.js`, split out from `server.js` for exactly this
purpose) and an in-memory MongoDB (`mongodb-memory-server`). Run with `npm run test:integration`
from `backend/` (needs `npm install` first, and the `--experimental-test-module-mocks` Node flag,
already wired into that script).

**Read this before trusting these blindly**: unlike the unit tests from an earlier round — where
3 of 4 suites had zero external dependencies and I actually ran them in this sandbox, 23/23
passing — none of these integration tests could be executed here at all, for three independent
reasons:
1. `mongodb-memory-server` downloads a real `mongod` binary on first use, which needs network.
2. The upload "happy path" test exercises real PDF parsing and real local embedding generation
   (`@xenova/transformers`), which downloads model weights on first use — another network need.
3. The chat tests mock Groq and the embedding service via `node:test`'s `mock.module`, which is
   still an **experimental** Node API. It's written to my best understanding of that API's
   shape, but I have no way to confirm the mocking actually intercepts the import the way it's
   supposed to, since I can't run it here.

So: `auth.test.js` is the most likely to just work as-is (no ML pipeline, no mocking, only the
memory-server binary download standing between it and passing). `upload.test.js`'s validation
tests (auth requirement, non-PDF rejection, missing file) are in the same boat; its "successful
upload" and duplicate-detection tests additionally need the embedding model download to succeed.
`chat.test.js` is the one I'd actually sit down and debug first if something's wrong — the
module-mocking mechanics are the part of this whole four-round-plus-Phase-3 engagement I'm least
confident shipped correctly without seeing it run.

## Phase 3: AI-generated study plans

The second Phase 3 feature — a day-by-day study plan generated from the student's notes, at
`/study-plan`.

- **Backend** (`studyPlan.js`, new `StudyPlan` model): given a subject scope (or all subjects)
  and either an exam date or a plain number of days, gathers the matching PDFs' full text,
  compresses each via the same `compressIfLong` map-reduce helper flashcards/quiz/summary
  already use, and asks the LLM for a JSON day-by-day breakdown (`planTitle`, and per day: a
  subject, topics, a focus description, and an estimated study time). Validated the same way as
  flashcards/quiz — `extractAndValidateJson` against a Zod schema, 502 on a malformed response
  rather than saving garbage.
- **Weak-subject prioritization**: pulls the student's `QuizAttempt` history (from the analytics
  feature) for the relevant subject(s), and tells the LLM which subjects they've scored under
  70% on average, so those get more time and earlier placement in the plan — a study plan that
  ignores what the student is already struggling with wouldn't be worth much.
- **Exam-date math handled in the route, not the schema**: `examDate` is validated as a plain
  string in Zod (`schemas.js`) and parsed/checked (valid date, not in the past) in the route
  itself, rather than via a Zod date-format validator — simpler to reason about correctly than
  relying on exact date-string parsing edge cases I can't test here.
- **Persistence + tracking**: plans are saved with a per-day `completed` checkbox, toggled via
  `PATCH /study-plan/:id/days/:dayIndex`. This is the first write-heavy, incrementally-updated
  document in the app (versus create-once-and-read chat history) — a plan is fetched, mutated
  optimistically in the UI, then persisted.
- **Frontend** (`StudyPlan.jsx`): subject picker, exam-date-or-days-count form, generated plan
  shown as a checklist, plus a list of previously generated plans to revisit.

## Phase 3: Collaborative study groups

The third Phase 3 feature — students can form a group, share notes into it, and ask questions
grounded in everything the group has shared together, at `/groups` and `/groups/:id`.

- **Data model** (`StudyGroup`, `GroupMembership`, `GroupPdfShare`, `GroupChatMessage`): three
  separate collections rather than embedded arrays, same reasoning as the earlier Chunk/Pdf
  split — a group's member list and shared-PDF list can't cause a document to hit MongoDB's size
  limit, and "which groups is user X in" / "who's in group Y" are indexed queries rather than
  array scans.
- **Sharing doesn't copy or move a PDF** — `GroupPdfShare` is a join between a group and a PDF
  the original uploader still owns; the group's chat draws its chunk pool from every PDF that's
  been shared to it, regardless of who shared it or who's asking.
- **Group chat is one shared thread, not per-member** — everyone in the group sees the same
  question-and-answer history, reusing the same SSE-streaming + `answerAcrossNotes` machinery
  from multi-document chat, just scoped to the group's shared-PDF pool instead of one user's
  subject filter.
- **Membership as a middleware**: every group-scoped route runs a shared `requireMembership`
  check once (attaching `req.group`/`req.membership`) instead of each route re-deriving it.
- **Roles kept minimal on purpose**: owner vs. member, no per-member permissions beyond that.
  The owner can delete the group (cascading memberships/shares/chat history); anyone else can
  leave directly; unsharing a PDF is allowed for whoever shared it, or the owner.
- **Invite codes**: 6 characters from a 32-symbol alphabet with ambiguous characters (0/O/1/I)
  removed, since these are meant to be read aloud or typed in, not just clicked as a link.

## Phase 3: Spaced repetition flashcards (Phase 3 complete)

The fourth and final Phase 3 item — flashcards are now persisted and scheduled via SM-2 (the
algorithm behind SuperMemo/Anki), rather than generated fresh and thrown away on every visit.

- **Flashcards are now saved**: they weren't before — `Flashcards.jsx` held generated cards only
  in React state, gone on refresh. A new `Flashcard` model persists each card with SM-2 fields
  (`easeFactor`, `interval`, `repetitions`, `nextReviewDate`); generating cards for a PDF now
  saves them immediately due for review.
- **`spacedRepetition.js`**: SM-2 as a pure function of a card's current state + a review
  quality rating — no DB dependency, so it's directly unit-testable. **I actually ran these
  tests** (8/8 pass, no external dependencies) — same category of confidence as the vectorStore/
  chunker/sanitizeFilename suites from earlier, unlike the integration tests.
- **4-button rating** (Again/Hard/Good/Easy) rather than SM-2's original 0-5 scale, matching
  Anki's convention since it's a more intuitive UI than a numeric slider.
- **`GET /flashcards/due/queue`**: due cards across ALL of a user's PDFs at once (optionally
  filtered by subject) — the actual point of spaced repetition is reviewing across everything
  you've learned, not one PDF at a time, so this is deliberately not scoped to a single PDF the
  way flashcard generation is.
- **`Review.jsx`**: a dedicated review session — flip a card, rate recall, move to the next due
  card, until the queue for the selected scope is empty.

All five Phase 3 items are now built: analytics dashboard, AI-generated study plans, collaborative
study groups, and spaced repetition flashcards. The mobile app remains set aside as a separate
project, as agreed earlier.

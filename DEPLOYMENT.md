# Deployment Guide

Three ways to run this in production, from simplest to most portable:

1. **Vercel + Railway** — easiest, free-tier friendly, no server management. Recommended default.
2. **Docker Compose on your own VM** — full control, one `docker compose up`, you manage the box.
3. **CI/CD** — a GitHub Actions workflow gates merges to `main` with tests + Docker build checks;
   Vercel/Railway's own GitHub integrations handle actual deployment once code lands on `main`.

This assumes a GitHub repo with `frontend/` and `backend/` folders at the root (push the
extracted `ai-study-assistant` project if you haven't already).

---

## Option 1: Vercel (frontend) + Railway (backend)

### 1. MongoDB Atlas (database + cloud storage)

1. Create a free cluster at https://www.mongodb.com/cloud/atlas/register
2. Under **Database Access**, create a user with a password (save it).
3. Under **Network Access**, add `0.0.0.0/0` (allow from anywhere) — simplest for a student
   project; Railway's outbound IPs aren't static on the free tier.
4. Click **Connect → Drivers**, copy the connection string:
   `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/ai_study_assistant`
   Fill in your real username/password, and keep the database name at the end.

### 2. Backend on Railway

1. Go to https://railway.app → **New Project → Deploy from GitHub repo** → select your repo.
2. Set **root directory** to `backend` (Settings → Root Directory). Railway will pick up
   `backend/nixpacks.toml` (installs Ghostscript + GraphicsMagick for OCR) automatically — OR,
   if you'd rather build from the Dockerfile instead of Nixpacks, Railway supports that too:
   Settings → Deploy → Builder → **Dockerfile**. Either works; Nixpacks is the simpler default.
3. Under **Variables**, add:
   - `GROQ_API_KEY` — from https://console.groq.com
   - `MONGODB_URI` — the connection string from step 1
   - `JWT_SECRET` — any long random string (`openssl rand -hex 32`)
   - `CORS_ORIGIN` — your Vercel URL, e.g. `https://ai-study-assistant.vercel.app` (add this
     after step 3 below, then redeploy)
   - Railway sets `PORT` automatically.
4. Under **Settings → Networking**, click **Generate Domain** — copy the URL, the frontend needs it.
5. Deploy. Check `https://<your-railway-domain>/api/health` returns `{"status":"ok"}`.

### 3. Frontend on Vercel

1. Go to https://vercel.com → **Add New → Project** → import the same GitHub repo.
2. Set **Root Directory** to `frontend`. Framework preset: Vite (auto-detected).
3. Add an environment variable: `VITE_API_URL` = `https://<your-railway-domain>/api/v1`
   (note the `/v1` — the API is versioned; `frontend/src/api/client.js` already reads this
   env var, no code changes needed).
4. Deploy. Vercel gives you a URL like `https://ai-study-assistant.vercel.app`.
5. Go back to Railway and set `CORS_ORIGIN` to that exact Vercel URL, then redeploy the backend.

### 4. Sanity check

- Visit your Vercel URL, sign up, upload a small PDF, try the chat.
- Upload failures → check Railway logs for a missing/incorrect `MONGODB_URI` or `GROQ_API_KEY`.
- Frontend can't reach backend at all → double-check `VITE_API_URL` (Vercel) and `CORS_ORIGIN`
  (Railway) match exactly, including `https://`, `/api/v1`, and no trailing slash.

### 5. Before you share the link

- Update `your-domain.example` placeholders in `frontend/index.html`, `public/robots.txt`,
  and `public/sitemap.xml` to your real domain.
- Railway's free tier has a monthly usage cap — avoid leaving the backend under heavy load
  for hours at a time.

---

## Option 2: Docker Compose (self-hosted)

For running this on your own VM/server instead of Vercel+Railway, or for a fully local
demo with no cloud accounts at all.

**Not verified by an actual run** — the Dockerfiles and compose file were written in a sandbox
with no Docker daemon available, so `docker compose up` has never actually been executed against
them. They follow standard, well-worn patterns, but build and test locally before relying on this.

```bash
cp .env.example .env
# edit .env: fill in GROQ_API_KEY and JWT_SECRET
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend: http://localhost:5000/api/v1/health
- This spins up a **local MongoDB container** (not Atlas) — fine for local dev/demo, but for
  a real deployment on a VM, either keep using Atlas (set `MONGODB_URI` to your Atlas string
  instead of the local `mongo` service in `docker-compose.yml`) or make sure the `mongo`
  container's volume is properly backed up.
- To deploy this compose stack on an actual VM: copy the repo + your `.env` to the server,
  install Docker, run the same `docker compose up --build -d`, and put a reverse proxy
  (nginx, Caddy, or Railway/Fly.io's own ingress if you deploy the images there instead) in
  front of it for HTTPS — the compose file itself doesn't handle TLS termination.

---

## Option 3: CI/CD (GitHub Actions)

`.github/workflows/ci.yml` runs on every push/PR to `main`:

1. **Backend unit tests** — only the dependency-free suites (`vectorStore`, `chunker`,
   `sanitizeFilename`, `spacedRepetition`, `parseJson`) — these are the ones actually verified
   during development. `test:integration` (needs `mongodb-memory-server` + `supertest`) is
   deliberately NOT wired into CI yet — confirm it passes locally first (see the "Integration
   tests" section of `README.md` for why those specifically couldn't be verified during
   development).
2. **Docker build checks** for both `backend/Dockerfile` and `frontend/Dockerfile` — catches a
   broken Dockerfile before it reaches `main`, without actually pushing or deploying an image.

**This workflow does not deploy anything.** If you're using Option 1 (Vercel + Railway), each
platform's own GitHub integration auto-deploys whatever lands on `main` — that's the "CD" half,
and it's already active once you connect the repo in steps 2/3 above. This CI workflow is a merge
gate in front of that, not a replacement for it. If you want CI to also push Docker images
somewhere (e.g., GitHub Container Registry) or deploy via the Railway/Vercel CLI instead of their
git integrations, that's a reasonable next step but isn't set up here — needs registry
credentials/deploy tokens added as repository secrets first.

**Also not verified by an actual run** — same caveat as the Docker files: this was written
without network access to push to GitHub and watch Actions execute it. Push it and check the
Actions tab before assuming it's green.

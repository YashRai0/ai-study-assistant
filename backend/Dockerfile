# Multi-stage build: system packages (Ghostscript + GraphicsMagick, needed
# for OCR via pdf2pic — see src/services/ocr.js) are only installed in the
# final runtime stage, not duplicated across stages.
#
# NOT VERIFIED BY AN ACTUAL BUILD: this project was built in a sandbox with
# no Docker daemon and no network access, so this Dockerfile has never
# actually been run through `docker build`. It follows standard, well-worn
# patterns (multi-stage Node build, non-root user, apt package install) that
# I'm confident in individually, but the full build has not been executed
# end-to-end. Build it locally and check the output before trusting it in CI.

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

FROM node:22-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    ghostscript \
    graphicsmagick \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Non-root user rather than the container default root.
RUN useradd --create-home appuser && chown -R appuser:appuser /app
USER appuser

ENV NODE_ENV=production
EXPOSE 5000

# NOTE: @xenova/transformers downloads its embedding model
# (all-MiniLM-L6-v2, ~90MB) from Hugging Face on first use if it isn't
# already cached in the image — the running container needs outbound
# network access on its first request unless you add a build step to
# pre-download the model (not done here, to keep this image's build fast
# and network-independent; see DEPLOYMENT.md for the tradeoff and how to
# pre-bake it if you'd rather avoid a slow/network-dependent first request).
CMD ["node", "server.js"]

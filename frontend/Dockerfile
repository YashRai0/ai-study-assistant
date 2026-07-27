# Multi-stage: build the Vite app, then serve the static output via nginx —
# no Node runtime needed in the final image.
#
# NOT VERIFIED BY AN ACTUAL BUILD — same caveat as backend/Dockerfile: no
# Docker daemon was available where this project was built. Standard
# pattern, but build and check it locally before trusting it in CI.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .

# Vite env vars are baked in at BUILD time, not read at container runtime —
# pass this via --build-arg when building the image, e.g.:
#   docker build --build-arg VITE_API_URL=https://your-backend/api/v1 .
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

# Multi-stage build for the React frontend.
# Coolify builds this image, pushes to its internal registry, and runs it
# behind Traefik (which terminates TLS). The container itself listens on
# plain HTTP port 80 — Coolify handles HTTPS at the proxy.

# ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app

# Vite reads VITE_* env vars at BUILD time and inlines them into the bundle.
# Coolify injects these as build-args during `docker build`. Keep them in
# this exact order so caching invalidations are predictable.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

# Install dependencies first so Docker can cache the layer when only source
# files change. `npm ci` is the deterministic install — it requires the
# lockfile and package.json to be in sync, which they are for committed code.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Copy the rest of the source and build. The PWA plugin emits sw.js,
# registerSW.js, manifest.webmanifest, and the icon set into dist/.
COPY . .
RUN npm run build

# ---- Serve stage ----
FROM nginx:alpine

# Replace the default site config with ours (SPA fallback + cache headers).
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Static build output goes to nginx's default web root.
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

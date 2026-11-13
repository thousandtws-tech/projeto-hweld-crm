# syntax=docker/dockerfile:1

# ── Builder ───────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ── Runtime — nginx estático ──────────────────────────────────────────────
FROM nginx:1.27-alpine
COPY --from=builder /app/dist/cliente-web/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

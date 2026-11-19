# syntax=docker/dockerfile:1

# ── Builder ───────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ── Runtime — nginx estático ──────────────────────────────────────────────
# Upstreams resolvidos por env (envsubst em /etc/nginx/templates):
#   dev/compose → nomes dos containers · Railway → *.railway.internal
FROM nginx:1.27-alpine
ENV API_UPSTREAM=core-api:8080 \
    OPS_UPSTREAM=operations-api:8080 \
    MOTOR_UPSTREAM=realtime-engine:4100
COPY --from=builder /app/dist/cliente-web/browser /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 80

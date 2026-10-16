# syntax=docker/dockerfile:1

# ── Builder ───────────────────────────────────────────────────────────────
FROM rust:1.85-slim-bookworm AS builder

RUN apt-get update && \
    apt-get install -y --no-install-recommends pkg-config libssl-dev && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cache de dependências — copia manifests primeiro.
COPY Cargo.toml Cargo.lock ./
COPY crates/ ./crates/

RUN cargo build --release --bin hweld-server

# ── Runtime ───────────────────────────────────────────────────────────────
FROM debian:bookworm-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates libssl3 && \
    rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /bin/false hweld

WORKDIR /app
COPY --from=builder /app/target/release/hweld-server /usr/local/bin/hweld-server

USER hweld

EXPOSE 8080

ENTRYPOINT ["hweld-server"]

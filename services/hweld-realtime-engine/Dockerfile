# syntax=docker/dockerfile:1

# ── Builder ───────────────────────────────────────────────────────────────
FROM elixir:1.18-otp-27 AS builder

RUN apt-get update && \
    apt-get install -y --no-install-recommends build-essential git ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN mix local.hex --force && mix local.rebar --force

ENV MIX_ENV=prod

# Cache de deps — manifests primeiro.
COPY mix.exs mix.lock ./
RUN mix deps.get --only prod && mix deps.compile

# Config antes do código (compile depende de config/*.exs).
COPY config/config.exs config/prod.exs config/runtime.exs ./config/
COPY priv ./priv
COPY assets ./assets
COPY lib ./lib

RUN mix compile
RUN mix assets.setup
RUN mix assets.deploy
RUN mix release

# ── Runtime ───────────────────────────────────────────────────────────────
FROM debian:bookworm-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libstdc++6 openssl libncurses6 locales ca-certificates && \
    rm -rf /var/lib/apt/lists/*

RUN sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen && locale-gen
ENV LANG=en_US.UTF-8 LANGUAGE=en_US:en LC_ALL=en_US.UTF-8

RUN useradd --create-home --shell /bin/false hweld
WORKDIR /app
COPY --from=builder /app/_build/prod/rel/motor_realtime ./
USER hweld

EXPOSE 4100
ENV PHX_SERVER=true

ENTRYPOINT ["bin/motor_realtime"]
CMD ["start"]

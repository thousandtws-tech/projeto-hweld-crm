import Config

# Force using SSL in production. This also sets the "strict-security-transport" header,
# known as HSTS. If you have a health check endpoint, you may want to exclude it below.
# Note `:force_ssl` is required to be set at compile-time.
config :motor_realtime, MotorRealtimeWeb.Endpoint,
  force_ssl: [
    rewrite_on: [:x_forwarded_proto],
    exclude: [
      # paths: ["/health"],
      # *.railway.internal: tráfego interno container→container chega em HTTP
      # puro (sem x-forwarded-proto) — sem o exclude, Plug.SSL responderia 301
      # e quebraria o POST /ingest do core-api.
      hosts: ["localhost", "127.0.0.1", "realtime-engine.railway.internal"]
    ]
  ]

# Do not print debug messages in production
config :logger, level: :info

# Runtime production configuration, including reading
# of environment variables, is done on config/runtime.exs.

import Config

# We don't run a server during test. If one is required,
# you can enable the server option below.
config :motor_realtime, MotorRealtimeWeb.Endpoint,
  http: [ip: {127, 0, 0, 1}, port: 4002],
  secret_key_base: "y2kyJQK4jJR/BdLvQ/ealdmzEmlnbPHDOTTujcCTohTj5qlYPV4qMcjYiVtIru+e",
  server: false

# Testes herméticos — não dependem do .env do backend nem do Postgres.
config :motor_realtime,
  jwt_secret: "segredo-de-teste-do-motor",
  ingest_token: "token-ingest-teste",
  database_url: nil

# Print only warnings and errors during test
config :logger, level: :warning

# Initialize plugs at runtime for faster test compilation
config :phoenix, :plug_init_mode, :runtime

# Sort query params output of verified routes for robust url comparisons
config :phoenix,
  sort_verified_routes_query_params: true

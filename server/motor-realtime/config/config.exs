# This file is responsible for configuring your application
# and its dependencies with the aid of the Config module.
#
# This configuration file is loaded before any dependency and
# is restricted to this project.

# General application configuration
import Config

config :motor_realtime,
  generators: [timestamp_type: :utc_datetime]

# Configure the endpoint
config :motor_realtime, MotorRealtimeWeb.Endpoint,
  url: [host: "localhost"],
  adapter: Bandit.PhoenixAdapter,
  render_errors: [
    formats: [json: MotorRealtimeWeb.ErrorJSON],
    layout: false
  ],
  pubsub_server: MotorRealtime.PubSub,
  live_view: [signing_salt: "bJdMm/9/"]

# Configure Elixir's Logger
config :logger, :default_formatter,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id]

# Use Jason for JSON parsing in Phoenix
config :phoenix, :json_library, Jason

# Assets do painel de monitoramento (LiveView) — bundlers standalone,
# sem Node.js. `mix assets.setup` baixa os binários.
config :esbuild,
  version: "0.25.4",
  motor_realtime: [
    args:
      ~w(js/app.js --bundle --target=es2022 --outdir=../priv/static/assets --external:/fonts/* --external:/images/*),
    cd: Path.expand("../assets", __DIR__),
    env: %{"NODE_PATH" => Path.expand("../deps", __DIR__)}
  ]

config :tailwind,
  version: "4.1.7",
  motor_realtime: [
    args: ~w(--input=css/app.css --output=../priv/static/assets/app.css),
    cd: Path.expand("../assets", __DIR__)
  ]

# Import environment specific config. This must remain at the bottom
# of this file so it overrides the configuration defined above.
import_config "#{config_env()}.exs"

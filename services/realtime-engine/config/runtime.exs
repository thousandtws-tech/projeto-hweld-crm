import Config

# config/runtime.exs is executed for all environments, including
# during releases. It is executed after compilation and before the
# system starts, so it is typically used to load production configuration
# and secrets from environment variables or elsewhere. Do not define
# any compile-time configuration in here, as it won't be applied.
# The block below contains prod specific runtime configuration.

# ## Using releases
#
# If you use `mix release`, you need to explicitly enable the server
# by passing the PHX_SERVER=true when you start it:
#
#     PHX_SERVER=true bin/motor_realtime start
#
# Alternatively, you can use `mix phx.gen.release` to generate a `bin/server`
# script that automatically sets the env var above.
if System.get_env("PHX_SERVER") do
  config :motor_realtime, MotorRealtimeWeb.Endpoint, server: true
end

# Em dev o dev.exs já fixa 127.0.0.1:4100; este override só roda quando
# MOTOR_PORT está definida ou em produção (bind geral + porta por env).
if System.get_env("MOTOR_PORT") || config_env() == :prod do
  config :motor_realtime, MotorRealtimeWeb.Endpoint,
    http: [ip: {0, 0, 0, 0}, port: String.to_integer(System.get_env("MOTOR_PORT", "4100"))]
end

# ---------------------------------------------------------------------------
# Segredos e integração — lidos de env em qualquer ambiente. Fora de prod,
# cai para o `.env` do backend Rust (`services/core-api/.env`) como fonte
# única do JWT_SECRET e do token de ingest — sem segredo duplicado no repo.
# ---------------------------------------------------------------------------

dotenv = fn chave ->
  path = Path.expand("../../core-api/.env", __DIR__)

  if File.exists?(path) do
    path
    |> File.read!()
    |> String.split("\n")
    |> Enum.find_value(fn linha ->
      case String.split(linha, "=", parts: 2) do
        [k, v] -> if String.trim(k) == chave, do: String.trim(v)
        _ -> nil
      end
    end)
  end
end

# Só o ambiente dev herda o .env do backend — testes usam test.exs (hermético).
# String vazia no ambiente conta como ausente (Windows adora var vazia setada).
env = fn chave ->
  case System.get_env(chave) do
    v when is_binary(v) and v != "" -> v
    _ -> config_env() == :dev && dotenv.(chave)
  end
end

jwt_secret = env.("JWT_SECRET")
ingest_token = env.("MOTOR_INGEST_TOKEN")

if config_env() == :prod do
  if is_nil(jwt_secret) or jwt_secret == "" do
    raise "JWT_SECRET é obrigatória em produção (valida os tokens staff/portal)"
  end

  if is_nil(ingest_token) or ingest_token == "" do
    raise "MOTOR_INGEST_TOKEN é obrigatório em produção (autentica o backend Rust no /ingest)"
  end
end

# `||` no app env preserva valores fixos do test.exs (testes herméticos).
config :motor_realtime,
  jwt_secret: jwt_secret || Application.get_env(:motor_realtime, :jwt_secret),
  ingest_token: ingest_token || Application.get_env(:motor_realtime, :ingest_token),
  database_url: env.("DATABASE_URL") || Application.get_env(:motor_realtime, :database_url),
  backend_api_url: System.get_env("RUST_API_URL") || "http://localhost:8080/api/v1",
  cors_origins:
    (System.get_env("CORS_ORIGINS") ||
       "http://localhost:4210,http://localhost:4200,http://localhost:4300,http://localhost:5173")
    |> String.split(",")
    |> Enum.map(&String.trim/1)

if config_env() == :prod do
  # The secret key base is used to sign/encrypt cookies and other secrets.
  # A default value is used in config/dev.exs and config/test.exs but you
  # want to use a different value for prod and you most likely don't want
  # to check this value into version control, so we use an environment
  # variable instead.
  secret_key_base =
    System.get_env("SECRET_KEY_BASE") ||
      raise """
      environment variable SECRET_KEY_BASE is missing.
      You can generate one by calling: mix phx.gen.secret
      """

  host = System.get_env("PHX_HOST") || "example.com"

  config :motor_realtime, :dns_cluster_query, System.get_env("DNS_CLUSTER_QUERY")

  config :motor_realtime, MotorRealtimeWeb.Endpoint,
    url: [host: host, port: 443, scheme: "https"],
    http: [
      # Enable IPv6 and bind on all interfaces.
      # Set it to  {0, 0, 0, 0, 0, 0, 0, 1} for local network only access.
      # See the documentation on https://bandit.hexdocs.pm/Bandit.html#t:options/0
      # for details about using IPv6 vs IPv4 and loopback vs public addresses.
      ip: {0, 0, 0, 0, 0, 0, 0, 0}
    ],
    secret_key_base: secret_key_base

  # ## SSL Support
  #
  # To get SSL working, you will need to add the `https` key
  # to your endpoint configuration:
  #
  #     config :motor_realtime, MotorRealtimeWeb.Endpoint,
  #       https: [
  #         ...,
  #         port: 443,
  #         cipher_suite: :strong,
  #         keyfile: System.get_env("SOME_APP_SSL_KEY_PATH"),
  #         certfile: System.get_env("SOME_APP_SSL_CERT_PATH")
  #       ]
  #
  # The `cipher_suite` is set to `:strong` to support only the
  # latest and more secure SSL ciphers. This means old browsers
  # and clients may not be supported. You can set it to
  # `:compatible` for wider support.
  #
  # `:keyfile` and `:certfile` expect an absolute path to the key
  # and cert in disk or a relative path inside priv, for example
  # "priv/ssl/server.key". For all supported SSL configuration
  # options, see https://plug.hexdocs.pm/Plug.SSL.html#configure/1
  #
  # We also recommend setting `force_ssl` in your config/prod.exs,
  # ensuring no data is ever sent via http, always redirecting to https:
  #
  #     config :motor_realtime, MotorRealtimeWeb.Endpoint,
  #       force_ssl: [hsts: true]
  #
  # Check `Plug.SSL` for all available options in `force_ssl`.
end

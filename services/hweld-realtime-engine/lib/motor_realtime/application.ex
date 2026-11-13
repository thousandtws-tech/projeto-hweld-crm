defmodule MotorRealtime.Application do
  # See https://elixir.hexdocs.pm/Application.html
  # for more information on OTP Applications
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    # Postgrex só sobe quando DATABASE_URL está configurada — o resolver
    # de contato→empresa responde :error sem ela (streams portal falham 403).
    db =
      case Application.get_env(:motor_realtime, :database_url) do
        url when is_binary(url) -> [{Postgrex, pg_opts(url)}]
        _ -> []
      end

    children =
      [
        MotorRealtimeWeb.Telemetry,
        {DNSCluster, query: Application.get_env(:motor_realtime, :dns_cluster_query) || :ignore},
        {Phoenix.PubSub, name: MotorRealtime.PubSub},
        # Tabela ETS do resolver precisa nascer antes das conexões SSE.
        MotorRealtime.EmpresaResolver,
        # Log circular de eventos — replay SSE via Last-Event-ID.
        MotorRealtime.EventLog,
        # Telemetria/contadores do dashboard — antes do endpoint.
        MotorRealtime.Monitor
      ] ++ db ++ [MotorRealtimeWeb.Endpoint]

    # See https://elixir.hexdocs.pm/Supervisor.html
    # for other strategies and supported options
    opts = [strategy: :one_for_one, name: MotorRealtime.Supervisor]
    Supervisor.start_link(children, opts)
  end

  # `postgres://user:pass@host:port/db` → keyword do Postgrex (sem Ecto).
  defp pg_opts(url) do
    uri = URI.parse(url)
    {user, pass} = split_userinfo(uri.userinfo)

    [
      name: MotorRealtime.DB,
      hostname: uri.host || "localhost",
      port: uri.port || 5432,
      username: user,
      password: pass,
      database: String.trim_leading(uri.path || "", "/")
    ]
  end

  defp split_userinfo(nil), do: {nil, nil}

  defp split_userinfo(info) do
    case String.split(info, ":", parts: 2) do
      [u, p] -> {u, p}
      [u] -> {u, nil}
    end
  end

  # Tell Phoenix to update the endpoint configuration
  # whenever the application is updated.
  @impl true
  def config_change(changed, _new, removed) do
    MotorRealtimeWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end

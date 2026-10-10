defmodule MotorRealtimeWeb.IngestController do
  @moduledoc """
  `POST /ingest` — entrada de eventos do backend Rust (e futuros
  produtores internos). Auth por `MOTOR_INGEST_TOKEN` (pipeline
  `:ingest`). Valida o envelope e faz fan-out no PubSub.
  """

  use MotorRealtimeWeb, :controller

  alias MotorRealtime.{Barramento, Evento}

  @doc "Recebe um evento e publica. 202 + contagem de entregas."
  def create(conn, _params) do
    case Evento.de_params(conn.body_params) do
      {:ok, evento} ->
        {:ok, entregas} = Barramento.publicar(evento)

        conn
        |> put_status(202)
        |> json(%{aceito: true, entregas: entregas})

      {:error, motivo} ->
        conn
        |> put_status(422)
        |> json(%{aceito: false, erro: Atom.to_string(motivo)})
    end
  end
end

defmodule MotorRealtimeWeb.SaudeController do
  @moduledoc "Healthcheck e descoberta — `GET /health` e `GET /` para probes."

  use MotorRealtimeWeb, :controller

  def show(conn, _params) do
    json(conn, %{status: "ok", motor: "motor_realtime"})
  end

  @doc "Conveniência — /login leva ao painel de monitoramento."
  def login(conn, _params), do: redirect(conn, to: "/monitor")

  @doc "Raiz — identifica o serviço e expõe o mapa de endpoints."
  def index(conn, _params) do
    json(conn, %{
      servico: "motor_realtime",
      versao: Application.spec(:motor_realtime, :vsn) |> to_string(),
      endpoints: %{
        monitor: "GET /monitor (login staff — painel LiveView)",
        ingest: "POST /ingest (token de serviço)",
        staff_sse: "GET /events/staff (JWT staff)",
        portal_sse: "GET /events/portal (JWT portal)",
        websocket: "GET /socket (Phoenix Channels)",
        dashboard: "GET /dashboard (?token= — painel legado)",
        infra: "GET /infra (?token= — LiveDashboard)",
        health: "GET /health"
      }
    })
  end
end

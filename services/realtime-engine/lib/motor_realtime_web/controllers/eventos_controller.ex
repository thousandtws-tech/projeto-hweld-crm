defmodule MotorRealtimeWeb.EventosController do
  @moduledoc """
  Streams SSE — um processo leve por conexão (a VM BEAM é feita para isso).

  Contrato preservado do backend Rust para os fronts trocarem só a URL:
    * saudação `: hweld-realtime` + `retry: 3000`;
    * `event: {tipo}` + `data: {"tipo":..,"dados":..}`;
    * heartbeat `: ping` a cada 15s (proxies derrubam conexões inativas);
    * assinante lento: mailbox acima de `@max_queue` → `: lagged` + fecha;
      o cliente reconecta e reconcilia via REST (mesma semântica do
      broadcast ring do Rust, que dropava os mais antigos).
  """

  use MotorRealtimeWeb, :controller
  require Logger

  alias MotorRealtime.{Barramento, EmpresaResolver, Evento}

  @heartbeat_ms 15_000
  @retry_ms 3_000
  # Cap de mailbox: >512 eventos pendentes = consumidor lento demais.
  @max_queue 512

  @doc "GET /events/publico — visitantes da vitrine pública escutam eventos de catálogo/estoque."
  def publico(conn, _params) do
    Barramento.assinar(Barramento.topico_todos())
    Logger.info("SSE público conectado")
    stream(assign(conn, :sujeito_id, 0), :publico)
  end

  @doc "GET /events/staff — backoffice escuta todos os eventos."
  def staff(conn, _params) do
    Barramento.assinar(Barramento.topico_staff())
    Logger.info("SSE staff conectado (sujeito=#{conn.assigns.sujeito_id})")
    stream(conn, :staff)
  end

  @doc "GET /events/portal — só eventos da empresa do contato + públicos."
  def portal(conn, _params) do
    case EmpresaResolver.empresa_do_contato(conn.assigns.sujeito_id) do
      {:ok, empresa_id} ->
        Barramento.assinar(Barramento.topico_empresa(empresa_id))
        Barramento.assinar(Barramento.topico_todos())

        Logger.info(
          "SSE portal conectado (contato=#{conn.assigns.sujeito_id} empresa=#{empresa_id})"
        )

        stream(conn, :portal)

      :error ->
        conn
        |> put_resp_content_type("application/json")
        |> send_resp(403, Jason.encode!(%{erro: "contato_sem_empresa"}))
    end
  end

  defp stream(conn, audiencia) do
    meta = %{audiencia: audiencia, sujeito: conn.assigns.sujeito_id, pid: self()}
    :telemetry.execute([:motor_realtime, :conexao, :aberta], %{}, meta)

    conn =
      conn
      |> put_resp_content_type("text/event-stream")
      |> put_resp_header("cache-control", "no-cache")
      # nginx não bufferiza SSE
      |> put_resp_header("x-accel-buffering", "no")
      |> put_resp_header("connection", "keep-alive")
      |> send_chunked(200)

    try do
      case chunk(conn, ": hweld-realtime\nretry: #{@retry_ms}\n\n") do
        {:ok, conn} -> loop(conn)
        {:error, _} -> conn
      end
    after
      :telemetry.execute([:motor_realtime, :conexao, :fechada], %{}, meta)
    end
  end

  defp loop(conn) do
    receive do
      %Evento{} = evento ->
        if queue_cheia?() do
          _ = chunk(conn, ": lagged — reconcilie via REST\n\n")
          Logger.warning("SSE encerrado: mailbox acima de #{@max_queue} (cliente lento)")
          conn
        else
          dados = Jason.encode!(%{tipo: evento.tipo, dados: evento.dados})

          case chunk(conn, "event: #{evento.tipo}\ndata: #{dados}\n\n") do
            {:ok, conn} -> loop(conn)
            {:error, _} -> conn
          end
        end
    after
      @heartbeat_ms ->
        case chunk(conn, ": ping\n\n") do
          {:ok, conn} -> loop(conn)
          {:error, _} -> conn
        end
    end
  end

  defp queue_cheia? do
    {:message_queue_len, n} = Process.info(self(), :message_queue_len)
    n > @max_queue
  end
end

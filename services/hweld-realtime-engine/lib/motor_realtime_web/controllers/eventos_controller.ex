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

  alias MotorRealtime.{Barramento, EmpresaResolver, EventLog, Evento}

  @heartbeat_ms 15_000
  @retry_ms 3_000
  # Cap de mailbox: >512 eventos pendentes = consumidor lento demais.
  @max_queue 512

  @doc "GET /events/publico — visitantes da vitrine pública escutam eventos de catálogo/estoque."
  def publico(conn, _params) do
    topicos = [Barramento.topico_todos()]
    Enum.each(topicos, &Barramento.assinar/1)
    Logger.info("SSE público conectado")
    stream(assign(conn, :sujeito_id, 0), :publico, topicos)
  end

  @doc "GET /events/staff — backoffice escuta todos os eventos."
  def staff(conn, _params) do
    topicos = [Barramento.topico_staff()]
    Enum.each(topicos, &Barramento.assinar/1)
    Logger.info("SSE staff conectado (sujeito=#{conn.assigns.sujeito_id})")
    stream(conn, :staff, topicos)
  end

  @doc "GET /events/portal — só eventos da empresa do contato + públicos."
  def portal(conn, _params) do
    case EmpresaResolver.empresa_do_contato(conn.assigns.sujeito_id) do
      {:ok, empresa_id} ->
        topicos = [Barramento.topico_empresa(empresa_id), Barramento.topico_todos()]
        Enum.each(topicos, &Barramento.assinar/1)

        Logger.info(
          "SSE portal conectado (contato=#{conn.assigns.sujeito_id} empresa=#{empresa_id})"
        )

        stream(conn, :portal, topicos)

      :error ->
        conn
        |> put_resp_content_type("application/json")
        |> send_resp(403, Jason.encode!(%{erro: "contato_sem_empresa"}))
    end
  end

  defp stream(conn, audiencia, topicos) do
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
      with {:ok, conn} <- chunk(conn, ": hweld-realtime\nretry: #{@retry_ms}\n\n"),
           {:ok, conn} <- replay(conn, topicos) do
        loop(conn)
      else
        {:error, _} -> conn
      end
    after
      :telemetry.execute([:motor_realtime, :conexao, :fechada], %{}, meta)
    end
  end

  # Reenvia o que o cliente perdeu na queda: EventSource manda o último
  # `id:` recebido em `Last-Event-ID` ao reconectar — buscamos no EventLog
  # só os eventos dos tópicos assinados por esta conexão.
  defp replay(conn, topicos) do
    with [raw] <- get_req_header(conn, "last-event-id"),
         {last_id, ""} when last_id >= 0 <- Integer.parse(raw) do
      %{eventos: perdidos, gap: gap} = EventLog.desde(last_id, topicos)

      # Janela retida expirou sob este last_id — sinaliza explicitamente
      # para o cliente re-sincronizar via REST em vez de confiar no replay.
      with {:ok, conn} <- sinaliza_gap(conn, gap),
           {:ok, conn} <-
             Enum.reduce_while(perdidos, {:ok, conn}, fn evento, {:ok, c} ->
               case chunk(c, frame(evento)) do
                 {:ok, c} -> {:cont, {:ok, c}}
                 {:error, _} = erro -> {:halt, erro}
               end
             end) do
        if perdidos != [] do
          Logger.info(
            "SSE replay: #{length(perdidos)} eventos reenviados (sujeito=#{conn.assigns.sujeito_id})"
          )
        end

        {:ok, conn}
      end
    else
      _ -> {:ok, conn}
    end
  end

  defp sinaliza_gap(conn, false), do: {:ok, conn}

  defp sinaliza_gap(conn, true) do
    Logger.info("SSE replay: janela expirada, cliente deve reconciliar via REST")

    chunk(
      conn,
      "event: reconcile\ndata: #{Jason.encode!(%{motivo: "janela_expirada"})}\n\n"
    )
  end

  # Frame SSE completo: `id:` habilita Last-Event-ID no cliente.
  defp frame(%Evento{seq: seq} = evento) do
    dados = Jason.encode!(%{tipo: evento.tipo, dados: evento.dados})
    id = if seq, do: "id: #{seq}\n", else: ""
    "#{id}event: #{evento.tipo}\ndata: #{dados}\n\n"
  end

  defp loop(conn) do
    receive do
      %Evento{} = evento ->
        if queue_cheia?() do
          _ = chunk(conn, ": lagged — reconcilie via REST\n\n")
          Logger.warning("SSE encerrado: mailbox acima de #{@max_queue} (cliente lento)")
          conn
        else
          case chunk(conn, frame(evento)) do
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

defmodule MotorRealtime.Monitor do
  @moduledoc """
  Observabilidade do motor — telemetria interna consumida pelo `/dashboard`.

  Escuta os eventos Telemetry emitidos pelo barramento e pelas conexões:

    * `[:motor_realtime, :evento, :publicado]` — contadores por tipo,
      total de entregas e ring buffer dos últimos `@max_recentes` eventos
      (com o mapa de entregas por tópico — "quem recebeu");
    * `[:motor_realtime, :conexao, :aberta|fechada]` — contagem e lista
      das conexões vivas (audiência + sujeito);
    * `[:motor_realtime, :ingest, :rejeitado]` — publicações recusadas
      (token inválido ou payload malformado), sinal de ataque/misconfig.

  Estado: contadores em ETS público (leitura barata pelo controller) e
  ring buffer + conexões na memória do GenServer — nada sai do nó.
  """

  use GenServer

  alias Phoenix.PubSub

  @max_recentes 150
  @topico_monitor "monitor:dashboard"
  @tabela :motor_realtime_metricas

  @handlers [
    {[:motor_realtime, :evento, :publicado], :evento_publicado},
    {[:motor_realtime, :conexao, :aberta], :conexao_aberta},
    {[:motor_realtime, :conexao, :fechada], :conexao_fechada},
    {[:motor_realtime, :ingest, :rejeitado], :ingest_rejeitado}
  ]

  def start_link(_opts) do
    GenServer.start_link(__MODULE__, :ok, name: __MODULE__)
  end

  @doc "Snapshot completo para o dashboard — lê ETS + estado do GenServer."
  @spec snapshot() :: map()
  def snapshot do
    GenServer.call(__MODULE__, :snapshot)
  end

  @doc """
  Medição periódica do `telemetry_poller` — emite o número de conexões
  vivas por audiência para o LiveDashboard (`last_value`).
  """
  def emitir_metricas do
    # Poller pode medir antes do Monitor subir no boot — tabela ainda não
    # existe; emitir zeros (telemetry_poller remove medições que quebram).
    if :ets.info(@tabela) != :undefined do
      :telemetry.execute(
        [:motor_realtime, :conexoes, :ativas],
        %{staff: leia({:conexoes, :staff}), portal: leia({:conexoes, :portal})},
        %{}
      )
    end
  end

  @doc "Tópico PubSub que o painel LiveView assina para updates push."
  def topico_monitor, do: @topico_monitor

  @impl true
  def init(:ok) do
    # Counters em ETS named public — handlers Telemetry (qualquer processo)
    # incrementam sem passar pelo GenServer (zero contention no hot path).
    :ets.new(@tabela, [:named_table, :public, :set, {:write_concurrency, true}])

    :telemetry.attach_many(
      "motor-realtime-monitor",
      Enum.map(@handlers, &elem(&1, 0)),
      &__MODULE__.handle_telemetry/4,
      nil
    )

    {:ok,
     %{
       inicio: System.monotonic_time(),
       seq: 0,
       recentes: [],
       conectados: %{},
       por_tipo: %{}
     }}
  end

  @doc false
  def handle_telemetry([:motor_realtime, :evento, :publicado], medidas, meta, _cfg) do
    bump(:eventos_total)
    bump(:entregas_total, medidas.entregas)

    GenServer.cast(__MODULE__, {:evento, medidas, meta})
  end

  def handle_telemetry([:motor_realtime, :conexao, :aberta], _m, meta, _cfg) do
    bump({:conexoes, meta.audiencia})
    GenServer.cast(__MODULE__, {:conexao_aberta, meta.pid, meta.audiencia, meta.sujeito})
  end

  def handle_telemetry([:motor_realtime, :conexao, :fechada], _m, meta, _cfg) do
    bump({:conexoes, meta.audiencia}, -1)
    GenServer.cast(__MODULE__, {:conexao_fechada, meta.pid})
  end

  def handle_telemetry([:motor_realtime, :ingest, :rejeitado], _m, meta, _cfg) do
    bump(:ingest_rejeitado)
    bump({:ingest_rejeitado, meta.motivo})
  end

  @impl true
  def handle_cast({:evento, _medidas, meta}, st) do
    entrada = %{
      id: st.seq + 1,
      em: DateTime.utc_now() |> DateTime.truncate(:second),
      tipo: meta.tipo,
      audiencia: descrever_audiencia(meta.audiencia),
      dados: meta.dados,
      entregas: meta.entregas_por_topico,
      total_entregas: meta.entregas_por_topico |> Map.values() |> Enum.sum()
    }

    st = %{
      st
      | seq: st.seq + 1,
        recentes: Enum.take([entrada | st.recentes], @max_recentes),
        por_tipo: Map.update(st.por_tipo, meta.tipo, 1, &(&1 + 1))
    }

    notificar({:evento, entrada}, st)
    {:noreply, st}
  end

  def handle_cast({:conexao_aberta, pid, audiencia, sujeito}, st) do
    conexao = %{audiencia: audiencia, sujeito: sujeito, desde: DateTime.utc_now()}
    st = %{st | conectados: Map.put(st.conectados, pid, conexao)}
    notificar(:conexoes, st)
    {:noreply, st}
  end

  def handle_cast({:conexao_fechada, pid}, st) do
    st = %{st | conectados: Map.delete(st.conectados, pid)}
    notificar(:conexoes, st)
    {:noreply, st}
  end

  @impl true
  def handle_call(:snapshot, _from, st) do
    {:reply, montar_snapshot(st), st}
  end

  defp montar_snapshot(st) do
    uptime = System.monotonic_time() - st.inicio

    %{
      uptime_ms: System.convert_time_unit(uptime, :native, :millisecond),
      eventos_total: leia(:eventos_total),
      entregas_total: leia(:entregas_total),
      ingest_rejeitado: leia(:ingest_rejeitado),
      rejeicoes: motivos_rejeicao(),
      conexoes: %{
        staff: leia({:conexoes, :staff}),
        portal: leia({:conexoes, :portal})
      },
      conectados: st.conectados |> Map.values() |> Enum.sort_by(& &1.desde),
      por_tipo:
        st.por_tipo
        |> Enum.sort_by(&elem(&1, 1), :desc)
        |> Enum.map(fn {tipo, n} -> %{tipo: tipo, total: n} end),
      recentes: st.recentes
    }
  end

  defp motivos_rejeicao do
    @tabela
    |> :ets.tab2list()
    |> Enum.flat_map(fn
      {{:ingest_rejeitado, motivo}, n} -> [{motivo, n}]
      _ -> []
    end)
    |> Map.new()
  end

  defp descrever_audiencia(:staff), do: "staff"
  defp descrever_audiencia(:todos), do: "todos"
  defp descrever_audiencia({:empresa, id}), do: "empresa:#{id}"

  # Push para o painel LiveView — evento novo ou mudança de conexões.
  defp notificar({:evento, entrada}, st) do
    PubSub.broadcast(
      MotorRealtime.PubSub,
      @topico_monitor,
      {:monitor, {:evento, entrada}, resumo(st)}
    )
  end

  defp notificar(:conexoes, st) do
    PubSub.broadcast(MotorRealtime.PubSub, @topico_monitor, {:monitor, :conexoes, resumo(st)})
  end

  defp resumo(st) do
    %{
      conectados: Map.values(st.conectados),
      conexoes: %{staff: leia({:conexoes, :staff}), portal: leia({:conexoes, :portal})},
      eventos_total: leia(:eventos_total),
      entregas_total: leia(:entregas_total),
      ingest_rejeitado: leia(:ingest_rejeitado),
      por_tipo:
        st.por_tipo
        |> Enum.sort_by(&elem(&1, 1), :desc)
        |> Enum.map(fn {tipo, n} -> %{tipo: tipo, total: n} end),
      uptime_ms:
        System.convert_time_unit(System.monotonic_time() - st.inicio, :native, :millisecond)
    }
  end

  defp bump(key, n \\ 1) do
    :ets.update_counter(@tabela, key, n, {key, 0})
  end

  defp leia(key) do
    case :ets.lookup(@tabela, key) do
      [{^key, n}] -> n
      [] -> 0
    end
  end
end

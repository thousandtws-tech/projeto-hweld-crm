defmodule MotorRealtime.EventLog do
  @moduledoc """
  Log circular de eventos em ETS — sustenta o replay SSE via
  `Last-Event-ID`.

  Cada `Barramento.publicar/1` atribui uma sequência monotônica
  (`proximo_seq/0`) que sai no frame como `id: N`. Na reconexão, o
  controller chama `desde/2` com o último id recebido e os tópicos
  assinados — eventos perdidos durante a queda são reenviados antes do
  stream ao vivo.

  Volátil por design (mesma semântica best-effort do barramento): reinício
  ou estouro do ring zera o replay e o cliente reconcilia via REST —
  o que aconteceria de qualquer forma antes desta feature.
  """

  use GenServer

  alias MotorRealtime.Evento

  @tabela :motor_realtime_eventos_log
  @contador :motor_realtime_eventos_seq
  @max_eventos 2_000
  # Ao estourar, poda em lote — evita varredura por inserção.
  @lote_poda 200

  ## API pública

  def start_link(_opts), do: GenServer.start_link(__MODULE__, :ok, name: __MODULE__)

  @doc "Próximo id de sequência — atômico e fora do GenServer (hot path)."
  @spec proximo_seq() :: pos_integer()
  def proximo_seq do
    :ets.update_counter(@contador, :seq, 1, {:seq, 0})
  end

  @doc "Registra o evento com seus tópicos de entrega (async, cast)."
  @spec registrar(pos_integer(), Evento.t(), [String.t()]) :: :ok
  def registrar(seq, %Evento{} = evento, topicos) when is_list(topicos) do
    GenServer.cast(__MODULE__, {:registrar, seq, evento, topicos})
  end

  @doc """
  Eventos com `seq > last_id` entregues em algum dos `topicos` —
  ordenados por seq, capado em 500 para não inundar a reconexão.

  Retorna `%{eventos, gap: true}` quando `last_id` está abaixo do piso
  retido (eventos do intervalo foram podados) — o controller sinaliza
  `event: reconcile` para o cliente re-sincronizar via REST em vez de
  confiar num replay incompleto.
  """
  @spec desde(non_neg_integer(), [String.t()]) :: %{eventos: [Evento.t()], gap: boolean()}
  def desde(last_id, topicos) when is_integer(last_id) and is_list(topicos) do
    floor =
      case :ets.first(@tabela) do
        :"$end_of_table" -> nil
        chave -> chave
      end

    eventos =
      :ets.select(@tabela, [{{:"$1", :"$2", :"$3"}, [{:>, :"$1", last_id}], [:"$_"]}])
      |> Enum.filter(fn {_seq, _evento, tops} -> Enum.any?(tops, &(&1 in topicos)) end)
      |> Enum.take(500)
      |> Enum.map(fn {_seq, evento, _tops} -> evento end)

    %{eventos: eventos, gap: is_integer(floor) and floor > last_id + 1}
  end

  @doc "Último seq emitido — 0 antes de qualquer publicação (diagnóstico)."
  @spec ultimo_seq() :: non_neg_integer()
  def ultimo_seq do
    case :ets.lookup(@contador, :seq) do
      [{:seq, n}] -> n
      [] -> 0
    end
  end

  ## Callbacks

  @impl true
  def init(:ok) do
    :ets.new(@tabela, [:ordered_set, :public, :named_table, read_concurrency: true])
    :ets.new(@contador, [:set, :public, :named_table])
    {:ok, %{inseridos: 0}}
  end

  @impl true
  def handle_cast({:registrar, seq, evento, topicos}, state) do
    :ets.insert(@tabela, {seq, evento, topicos})
    state = %{state | inseridos: state.inseridos + 1}
    if rem(state.inseridos, @lote_poda) == 0, do: podar()
    {:noreply, state}
  end

  defp podar do
    excesso = :ets.info(@tabela, :size) - @max_eventos
    if excesso > 0, do: podar_oldest(excesso)
  end

  defp podar_oldest(0), do: :ok

  defp podar_oldest(n) when n > 0 do
    case :ets.first(@tabela) do
      :"$end_of_table" -> :ok
      chave ->
        :ets.delete(@tabela, chave)
        podar_oldest(n - 1)
    end
  end
end

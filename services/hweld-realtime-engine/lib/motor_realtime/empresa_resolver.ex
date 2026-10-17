defmodule MotorRealtime.EmpresaResolver do
  @moduledoc """
  Resolve `contato_id → empresa_id` para isolar o stream SSE do portal
  ao tenant certo — a mesma regra do `empresa_do_contato` do backend.

  Estratégia: cache ETS com TTL curto + query direta no Postgres
  (`Postgrex`, sem Ecto — uma única query justifica o peso zero).
  Revogação de acesso ao portal propaga em até `@ttl_ms`; o JWT do
  contato também expira pelo próprio TTL do backend.
  """

  use GenServer
  require Logger

  @tabela :motor_realtime_empresas
  @ttl_ms :timer.seconds(60)

  def start_link(opts) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc "Empresa dona do contato. `:error` se contato inexistente/sem portal."
  @spec empresa_do_contato(pos_integer()) :: {:ok, pos_integer()} | :error
  def empresa_do_contato(contato_id) when is_integer(contato_id) and contato_id > 0 do
    case :ets.lookup(@tabela, contato_id) do
      [{^contato_id, empresa_id, inserido_em}] ->
        if System.monotonic_time(:millisecond) - inserido_em < @ttl_ms do
          {:ok, empresa_id}
        else
          :ets.delete(@tabela, contato_id)
          resolver(contato_id)
        end

      [] ->
        resolver(contato_id)
    end
  end

  def empresa_do_contato(_), do: :error

  # -- GenServer ------------------------------------------------------------

  @impl true
  def init(_opts) do
    :ets.new(@tabela, [:named_table, :public, read_concurrency: true])
    {:ok, %{}}
  end

  # -- Interno ---------------------------------------------------------------

  defp resolver(contato_id) do
    case processo_db() do
      nil ->
        Logger.warning("EmpresaResolver sem conexão Postgres — contato #{contato_id} negado")
        :error

      pid ->
        case Postgrex.query(
               pid,
               "SELECT empresa_id FROM contatos \
                WHERE id = $1 AND deleted_at IS NULL AND acesso_portal",
               [contato_id]
             ) do
          {:ok, %{rows: [[empresa_id]]}} ->
            :ets.insert(@tabela, {contato_id, empresa_id, System.monotonic_time(:millisecond)})
            {:ok, empresa_id}

          {:ok, %{rows: []}} ->
            :error

          {:error, erro} ->
            Logger.error("EmpresaResolver falhou no Postgres: #{inspect(erro)}")
            :error
        end
    end
  end

  defp processo_db do
    Process.whereis(MotorRealtime.DB)
  end
end

defmodule MotorRealtime.Evento do
  @moduledoc """
  Contrato de evento do barramento realtime — espelha o `EventoRealtime`
  publicado pelo backend Rust (`entidade.acao`, ex.: `pedido.criado`).

  A audiência decide o fan-out:
    * `:staff`          — só o backoffice
    * `{:empresa, id}`  — backoffice + contatos portal daquela empresa
    * `:todos`          — backoffice + todos os portais (ex.: catálogo)
  """

  @enforce_keys [:tipo, :audiencia, :dados]
  # `seq` é atribuída pelo Barramento no publish (EventLog) — sai como
  # `id:` no frame SSE para suportar `Last-Event-ID` na reconexão.
  defstruct [:tipo, :audiencia, :dados, :seq]

  @type audiencia :: :staff | {:empresa, pos_integer()} | :todos
  @type t :: %__MODULE__{
          tipo: String.t(),
          audiencia: audiencia(),
          dados: map(),
          seq: pos_integer() | nil
        }

  @doc """
  Constrói um evento a partir do payload JSON do `/ingest`:

      %{
        "tipo" => "pedido.criado",
        "audiencia" => %{"escopo" => "empresa", "empresa_id" => 7},
        "dados" => %{...}
      }
  """
  @spec de_params(map()) :: {:ok, t()} | {:error, atom()}
  def de_params(%{"tipo" => tipo, "audiencia" => aud, "dados" => dados})
      when is_binary(tipo) and is_map(aud) and is_map(dados) do
    with :ok <- tipo_valido?(tipo),
         {:ok, audiencia} <- audiencia(aud) do
      {:ok, %__MODULE__{tipo: tipo, audiencia: audiencia, dados: dados}}
    end
  end

  def de_params(_), do: {:error, :payload_invalido}

  # Tipo segue `entidade.acao` — recusa vazio, espaços e gigantes
  # (defesa contra flood de tipos arbitrários no PubSub).
  defp tipo_valido?(tipo) do
    if String.match?(tipo, ~r/^[a-z0-9_]+(\.[a-z0-9_]+)+$/) and byte_size(tipo) <= 80 do
      :ok
    else
      {:error, :tipo_invalido}
    end
  end

  defp audiencia(%{"escopo" => "staff"}), do: {:ok, :staff}
  defp audiencia(%{"escopo" => "todos"}), do: {:ok, :todos}

  defp audiencia(%{"escopo" => "empresa", "empresa_id" => id})
       when is_integer(id) and id > 0,
       do: {:ok, {:empresa, id}}

  defp audiencia(_), do: {:error, :audiencia_invalida}
end

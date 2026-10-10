defmodule MotorRealtime.Barramento do
  @moduledoc """
  Barramento de eventos sobre `Phoenix.PubSub` — fan-out por tópico.

  Semântica de audiência (idêntica ao barramento que vivia no Rust):

    * todo evento vai para o tópico `staff` (o backoffice escuta tudo);
    * `{:empresa, id}` também vai para `empresa:{id}` (portal da empresa);
    * `:todos` também vai para `todos` (todos os portais).

  Assinantes (SSE ou Channel) recebem `%MotorRealtime.Evento{}` na mailbox
  do próprio processo — um subscriber lento nunca bloqueia o publisher.
  """

  alias MotorRealtime.Evento
  alias Phoenix.PubSub

  @pubsub MotorRealtime.PubSub
  @topico_staff "eventos:staff"
  @topico_todos "eventos:todos"

  @doc "Tópico que recebe todos os eventos (backoffice)."
  def topico_staff, do: @topico_staff

  @doc "Tópico público — todos os portais assinam além do próprio."
  def topico_todos, do: @topico_todos

  @doc "Tópico do portal de uma empresa específica."
  def topico_empresa(id), do: "eventos:empresa:#{id}"

  @doc "Assina o tópico no processo chamador."
  @spec assinar(String.t()) :: :ok
  def assinar(topico), do: PubSub.subscribe(@pubsub, topico)

  @doc """
  Publica o evento nos tópicos da audiência. Retorna `{:ok, n_topicos}` —
  tópico sem assinante não é erro (fire-and-forget).
  """
  @spec publicar(Evento.t()) :: {:ok, non_neg_integer()}
  def publicar(%Evento{} = e) do
    topicos =
      case e.audiencia do
        :staff -> [@topico_staff]
        {:empresa, id} -> [@topico_staff, topico_empresa(id)]
        :todos -> [@topico_staff, @topico_todos]
      end

    # Entregas reais por tópico (assinantes vivos neste nó) antes do broadcast —
    # alimenta o Monitor/dashboard ("quem recebeu"). Os subscribers do PubSub
    # vivem num Registry com o nome do próprio pubsub.
    entregas =
      Map.new(topicos, fn t -> {t, length(Registry.lookup(@pubsub, t))} end)

    # PubSub.broadcast/3 retorna :ok — entregamos o nº de tópicos atingidos.
    Enum.each(topicos, &PubSub.broadcast(@pubsub, &1, e))

    :telemetry.execute(
      [:motor_realtime, :evento, :publicado],
      %{topicos: length(topicos), entregas: entregas |> Map.values() |> Enum.sum()},
      %{tipo: e.tipo, audiencia: e.audiencia, dados: e.dados, entregas_por_topico: entregas}
    )

    {:ok, length(topicos)}
  end
end

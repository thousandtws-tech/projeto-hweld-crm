defmodule MotorRealtime.MonitorTest do
  use ExUnit.Case, async: false

  alias MotorRealtime.{Barramento, Evento, Monitor}

  defp publica(tipo, audiencia \\ :staff) do
    {:ok, _} = Barramento.publicar(%Evento{tipo: tipo, audiencia: audiencia, dados: %{"id" => 1}})
    # Garante que o cast do handler Telemetry já foi processado.
    _ = :sys.get_state(Monitor)
  end

  test "conta eventos publicados e entregas" do
    antes = Monitor.snapshot()
    publica("pedido.criado")
    depois = Monitor.snapshot()

    assert depois.eventos_total == antes.eventos_total + 1
    assert is_integer(depois.entregas_total)
  end

  test "ring buffer registra tipo, audiência e entregas por tópico" do
    # Um assinante em `todos` para a entrega aparecer no mapa.
    Barramento.assinar(Barramento.topico_todos())
    publica("catalogo.categorias", :todos)

    evento = Monitor.snapshot().recentes |> List.first()
    assert evento.tipo == "catalogo.categorias"
    assert evento.audiencia == "todos"
    assert evento.dados == %{"id" => 1}
    assert evento.entregas["eventos:todos"] == 1
    assert evento.total_entregas >= 1
  end

  test "por_tipo agrega contagens" do
    publica("estoque.movimentado")
    tipos = Monitor.snapshot().por_tipo |> Map.new(&{&1.tipo, &1.total})
    assert tipos["estoque.movimentado"] >= 1
  end

  test "conexão aberta/fechada ajusta contadores e lista de conectados" do
    :telemetry.execute(
      [:motor_realtime, :conexao, :aberta],
      %{},
      %{audiencia: :portal, sujeito: 999_999, pid: self()}
    )

    _ = :sys.get_state(Monitor)
    snap = Monitor.snapshot()
    assert Enum.any?(snap.conectados, &(&1.sujeito == 999_999 and &1.audiencia == :portal))

    :telemetry.execute(
      [:motor_realtime, :conexao, :fechada],
      %{},
      %{audiencia: :portal, sujeito: 999_999, pid: self()}
    )

    _ = :sys.get_state(Monitor)
    snap2 = Monitor.snapshot()
    refute Enum.any?(snap2.conectados, &(&1.sujeito == 999_999))
  end

  test "publicação emite broadcast no tópico do painel LiveView" do
    Phoenix.PubSub.subscribe(MotorRealtime.PubSub, Monitor.topico_monitor())
    publica("pedido.criado")

    assert_receive {:monitor, {:evento, %{tipo: "pedido.criado"}}, resumo}
    assert is_integer(resumo.eventos_total)
    assert is_list(resumo.por_tipo)
  end

  test "ingest rejeitado é contado por motivo" do
    antes = Monitor.snapshot().ingest_rejeitado

    :telemetry.execute(
      [:motor_realtime, :ingest, :rejeitado],
      %{},
      %{motivo: :token_invalido}
    )

    _ = :sys.get_state(Monitor)
    snap = Monitor.snapshot()
    assert snap.ingest_rejeitado == antes + 1
    assert snap.rejeicoes[:token_invalido] >= 1
  end
end

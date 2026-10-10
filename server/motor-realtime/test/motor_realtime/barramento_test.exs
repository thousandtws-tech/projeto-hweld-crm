defmodule MotorRealtime.BarramentoTest do
  use ExUnit.Case, async: false

  alias MotorRealtime.{Barramento, Evento}

  test "evento staff chega só no tópico staff" do
    Barramento.assinar(Barramento.topico_staff())
    Barramento.assinar(Barramento.topico_empresa(99))

    e = %Evento{tipo: "pedido.criado", audiencia: :staff, dados: %{"id" => 1}}
    assert {:ok, 1} = Barramento.publicar(e)

    assert_received ^e
    refute_received %Evento{audiencia: {:empresa, _}}
  end

  test "evento de empresa chega no staff e no tópico da empresa" do
    Barramento.assinar(Barramento.topico_staff())
    Barramento.assinar(Barramento.topico_empresa(7))
    Barramento.assinar(Barramento.topico_empresa(8))

    e = %Evento{tipo: "pedido.status_alterado", audiencia: {:empresa, 7}, dados: %{}}
    assert {:ok, 2} = Barramento.publicar(e)

    assert_received ^e
    assert_received ^e
    refute_received %Evento{}
  end

  test "evento público chega no staff e em todos" do
    Barramento.assinar(Barramento.topico_staff())
    Barramento.assinar(Barramento.topico_todos())

    e = %Evento{tipo: "catalogo.produtos", audiencia: :todos, dados: %{}}
    assert {:ok, 2} = Barramento.publicar(e)

    assert_received ^e
    assert_received ^e
    refute_received %Evento{}
  end
end

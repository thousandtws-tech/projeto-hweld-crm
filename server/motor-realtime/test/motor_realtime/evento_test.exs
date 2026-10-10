defmodule MotorRealtime.EventoTest do
  use ExUnit.Case, async: true

  alias MotorRealtime.Evento

  describe "de_params/1" do
    test "aceita evento staff" do
      assert {:ok, %Evento{tipo: "pedido.criado", audiencia: :staff, dados: %{"id" => 1}}} =
               Evento.de_params(%{
                 "tipo" => "pedido.criado",
                 "audiencia" => %{"escopo" => "staff"},
                 "dados" => %{"id" => 1}
               })
    end

    test "aceita evento de empresa" do
      assert {:ok, %Evento{audiencia: {:empresa, 7}}} =
               Evento.de_params(%{
                 "tipo" => "pedido.status_alterado",
                 "audiencia" => %{"escopo" => "empresa", "empresa_id" => 7},
                 "dados" => %{"id" => 1}
               })
    end

    test "aceita evento público" do
      assert {:ok, %Evento{audiencia: :todos}} =
               Evento.de_params(%{
                 "tipo" => "catalogo.produtos",
                 "audiencia" => %{"escopo" => "todos"},
                 "dados" => %{}
               })
    end

    test "rejeita tipo fora do padrão entidade.acao" do
      assert {:error, :tipo_invalido} =
               Evento.de_params(%{
                 "tipo" => "PEDIDO CRIADO",
                 "audiencia" => %{"escopo" => "staff"},
                 "dados" => %{}
               })
    end

    test "rejeita empresa sem id" do
      assert {:error, :audiencia_invalida} =
               Evento.de_params(%{
                 "tipo" => "pedido.criado",
                 "audiencia" => %{"escopo" => "empresa"},
                 "dados" => %{}
               })
    end

    test "rejeita payload malformado" do
      assert {:error, :payload_invalido} = Evento.de_params(%{})
      assert {:error, :payload_invalido} = Evento.de_params(%{"tipo" => "a.b"})
    end
  end
end

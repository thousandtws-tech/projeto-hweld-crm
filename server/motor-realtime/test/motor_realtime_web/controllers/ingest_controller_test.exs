defmodule MotorRealtimeWeb.IngestControllerTest do
  use MotorRealtimeWeb.ConnCase, async: false

  alias MotorRealtime.{Barramento, Evento}

  @payload %{
    "tipo" => "pedido.criado",
    "audiencia" => %{"escopo" => "staff"},
    "dados" => %{"id" => 1, "numero" => "PV-000001"}
  }

  defp token, do: Application.get_env(:motor_realtime, :ingest_token)

  test "rejeita sem token", %{conn: conn} do
    conn = post(conn, "/ingest", @payload)
    assert response(conn, 401)
  end

  test "rejeita token errado", %{conn: conn} do
    conn =
      conn
      |> put_req_header("authorization", "Bearer errado")
      |> post("/ingest", @payload)

    assert response(conn, 401)
  end

  test "publica evento válido no barramento", %{conn: conn} do
    Barramento.assinar(Barramento.topico_staff())

    conn =
      conn
      |> put_req_header("authorization", "Bearer #{token()}")
      |> post("/ingest", @payload)

    assert %{"aceito" => true} = json_response(conn, 202)
    assert_received %Evento{tipo: "pedido.criado"}
  end

  test "rejeita payload malformado", %{conn: conn} do
    conn =
      conn
      |> put_req_header("authorization", "Bearer #{token()}")
      |> post("/ingest", %{"tipo" => "x"})

    assert json_response(conn, 422)["erro"] == "payload_invalido"
  end
end

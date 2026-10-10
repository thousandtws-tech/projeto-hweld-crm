defmodule MotorRealtimeWeb.EventosControllerTest do
  use MotorRealtimeWeb.ConnCase, async: false

  defp token_jwt(tipo, sub) do
    secret = Application.get_env(:motor_realtime, :jwt_secret)
    signer = Joken.Signer.create("HS256", secret)

    {:ok, token, _} =
      Joken.generate_and_sign(
        %{},
        %{
          "sub" => to_string(sub),
          "tipo" => tipo,
          "exp" => Joken.CurrentTime.OS.current_time() + 3600,
          "iat" => Joken.CurrentTime.OS.current_time(),
          "jti" => Joken.generate_jti()
        },
        signer
      )

    token
  end

  test "staff sem token → 401", %{conn: conn} do
    assert response(get(conn, "/events/staff"), 401)
  end

  test "portal sem token → 401", %{conn: conn} do
    assert response(get(conn, "/events/portal"), 401)
  end

  test "token de portal não abre stream de staff", %{conn: conn} do
    conn =
      conn
      |> put_req_header("authorization", "Bearer #{token_jwt("portal", 1)}")
      |> get("/events/staff")

    assert response(conn, 401)
  end

  test "token de staff não abre stream de portal", %{conn: conn} do
    conn =
      conn
      |> put_req_header("authorization", "Bearer #{token_jwt("staff", 1)}")
      |> get("/events/portal")

    assert response(conn, 401)
  end

  test "JWT adulterado → 401", %{conn: conn} do
    conn =
      conn
      |> put_req_header("authorization", "Bearer #{token_jwt("staff", 1)}x")
      |> get("/events/staff")

    assert response(conn, 401)
  end

  test "health é público", %{conn: conn} do
    assert %{"status" => "ok"} = json_response(get(conn, "/health"), 200)
  end
end

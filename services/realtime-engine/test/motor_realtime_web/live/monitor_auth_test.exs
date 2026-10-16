defmodule MotorRealtimeWeb.MonitorAuthTest do
  use MotorRealtimeWeb.ConnCase, async: false

  defp token_staff do
    secret = Application.get_env(:motor_realtime, :jwt_secret)
    signer = Joken.Signer.create("HS256", secret)

    {:ok, token, _} =
      Joken.generate_and_sign(
        %{},
        %{
          "sub" => "1",
          "tipo" => "staff",
          "exp" => Joken.CurrentTime.OS.current_time() + 3600,
          "iat" => Joken.CurrentTime.OS.current_time(),
          "jti" => Joken.generate_jti()
        },
        signer
      )

    token
  end

  test "/monitor sem sessão redireciona ao login", %{conn: conn} do
    conn = get(conn, "/monitor")
    assert redirected_to(conn) == "/monitor/login"
  end

  test "/monitor/login é público", %{conn: conn} do
    conn = get(conn, "/monitor/login")
    assert response(conn, 200) =~ "Painel de monitoramento"
  end

  test "/monitor com sessão staff inválida redireciona", %{conn: conn} do
    conn =
      conn
      |> init_test_session(%{staff_token: "token-invalido"})
      |> get("/monitor")

    assert redirected_to(conn) == "/monitor/login"
  end

  test "/monitor com sessão staff válida renderiza o painel", %{conn: conn} do
    conn =
      conn
      |> init_test_session(%{staff_token: token_staff()})
      |> get("/monitor")

    assert response(conn, 200) =~ "Fluxo de eventos"
  end
end

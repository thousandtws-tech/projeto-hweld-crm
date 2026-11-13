defmodule MotorRealtimeWeb.DashboardControllerTest do
  use MotorRealtimeWeb.ConnCase, async: false

  defp token, do: Application.get_env(:motor_realtime, :ingest_token)

  test "dashboard exige token", %{conn: conn} do
    conn = get(conn, "/dashboard")
    assert response(conn, 401)
  end

  test "dashboard api exige token", %{conn: conn} do
    conn = get(conn, "/dashboard/api")
    assert response(conn, 401)
  end

  test "dashboard aceita token por query param", %{conn: conn} do
    conn = get(conn, "/dashboard?token=#{token()}")
    assert response(conn, 200) =~ "Motor Realtime"
  end

  test "dashboard api retorna snapshot", %{conn: conn} do
    conn = get(conn, "/dashboard/api?token=#{token()}")

    body = json_response(conn, 200)
    assert is_integer(body["eventos_total"])
    assert is_map(body["conexoes"])
    assert is_list(body["recentes"])
  end
end

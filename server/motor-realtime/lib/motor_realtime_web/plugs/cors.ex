defmodule MotorRealtimeWeb.Plugs.Cors do
  @moduledoc """
  CORS mínimo e explícito para os SPAs (portal e painel admin).

  Origins permitidas vêm de `:motor_realtime, :cors_origins` (runtime —
  sem recompilar). Somente `Authorization` + headers de SSE são aceitos;
  preflight `OPTIONS` responde 204 e encerra.
  """

  import Plug.Conn

  def init(opts), do: opts

  def call(conn, _opts) do
    case get_req_header(conn, "origin") do
      [origin] ->
        if origin in origens() do
          conn
          |> put_resp_header("access-control-allow-origin", origin)
          |> put_resp_header("vary", "origin")
          |> preflight()
        else
          conn
        end

      [] ->
        conn
    end
  end

  defp preflight(%{method: "OPTIONS"} = conn) do
    conn
    |> put_resp_header("access-control-allow-methods", "GET, POST, OPTIONS")
    |> put_resp_header("access-control-allow-headers", "authorization, content-type, accept")
    |> put_resp_header("access-control-max-age", "600")
    |> send_resp(204, "")
    |> halt()
  end

  defp preflight(conn), do: conn

  defp origens do
    Application.get_env(:motor_realtime, :cors_origins, [])
  end
end

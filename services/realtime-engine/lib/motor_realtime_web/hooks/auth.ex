defmodule MotorRealtimeWeb.Hooks.Auth do
  @moduledoc """
  `on_mount` do painel — o websocket do LiveView não passa pelo pipeline
  HTTP, então a sessão staff é revalidada no mount (segunda barreira).
  """

  import Phoenix.LiveView, only: [redirect: 2]
  import Phoenix.Component, only: [assign: 3]

  alias MotorRealtimeWeb.Plugs.AuthJwt

  def on_mount(:staff, _params, session, socket) do
    case staff?(session) do
      {:ok, sujeito_id} -> {:cont, assign(socket, :sujeito_id, sujeito_id)}
      :error -> {:halt, redirect(socket, to: "/monitor/login")}
    end
  end

  defp staff?(session) do
    with token when is_binary(token) <- session["staff_token"],
         {:ok, claims} <- AuthJwt.verificar(token),
         true <- claims["tipo"] == "staff",
         {sub, ""} when sub > 0 <- Integer.parse(to_string(claims["sub"])) do
      {:ok, sub}
    else
      _ -> :error
    end
  end
end

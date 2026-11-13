defmodule MotorRealtimeWeb.LoginLive do
  @moduledoc """
  Login do painel — form submit real para `POST /monitor/login`
  (o motor faz proxy das credenciais ao backend Rust e grava a
  sessão). Já autenticado → redireciona direto ao painel.
  """

  use MotorRealtimeWeb, :live_view

  alias MotorRealtimeWeb.Plugs.AuthJwt

  def mount(_params, session, socket) do
    if staff?(session) do
      {:ok, push_navigate(socket, to: ~p"/monitor")}
    else
      {:ok,
       assign(socket,
         form: to_form(%{"email" => "", "senha" => ""}, as: :login),
         page_title: "Entrar"
       )}
    end
  end

  defp staff?(session) do
    with token when is_binary(token) <- session["staff_token"],
         {:ok, claims} <- AuthJwt.verificar(token) do
      claims["tipo"] == "staff"
    else
      _ -> false
    end
  end

  def render(assigns) do
    ~H"""
    <div class="flex min-h-screen items-center justify-center px-4">
      <div class="w-full max-w-sm">
        <div class="mb-8 flex flex-col items-center gap-3">
          <div class="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-orange-500 to-orange-700 shadow-lg shadow-orange-900/40">
            <.icon name="bolt" class="text-2xl text-white" />
          </div>
          <div class="text-center">
            <h1 class="text-lg font-bold">HWeld <span class="text-orange-400">Realtime</span></h1>
            <p class="mt-1 text-xs text-slate-500">Painel de monitoramento · acesso staff</p>
          </div>
        </div>

        <.panel>
          <.form
            for={@form}
            action={~p"/monitor/login"}
            method="post"
            class="space-y-4 px-5 py-5"
          >
            <%= if msg = Phoenix.Flash.get(assigns[:flash] || %{}, :error) do %>
              <p class="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {msg}
              </p>
            <% end %>

            <.input field={@form[:email]} type="email" label="E-mail" required autofocus
              placeholder="voce@hweld.com" autocomplete="email" />
            <.input field={@form[:senha]} type="password" label="Senha" required
              placeholder="••••••••" autocomplete="current-password" />

            <.button type="submit" class="w-full">Entrar</.button>
          </.form>
        </.panel>

        <p class="mt-6 text-center text-[11px] text-slate-600">
          Credenciais validadas pelo backend — a mesma conta do painel administrativo.
        </p>
      </div>
    </div>
    """
  end
end

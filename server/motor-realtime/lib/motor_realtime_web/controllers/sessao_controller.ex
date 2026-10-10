defmodule MotorRealtimeWeb.SessaoController do
  @moduledoc """
  Sessão do painel `/monitor` — login staff.

  O motor **não valida credenciais**: faz proxy do email/senha ao
  `POST /auth/staff/login` do backend Rust (fonte única de verdade
  para credenciais, hash e bloqueio). O JWT retornado é validado
  localmente (`tipo=staff`) e guardado na sessão assinada.
  """

  use MotorRealtimeWeb, :controller

  alias MotorRealtimeWeb.Plugs.AuthJwt

  def create(conn, %{"login" => %{"email" => email, "senha" => senha}}) do
    case autenticar(email, senha) do
      {:ok, token} ->
        conn
        |> put_session(:staff_token, token)
        |> redirect(to: ~p"/monitor")

      {:error, :credenciais} ->
        conn
        |> put_flash(:error, "E-mail ou senha inválidos.")
        |> redirect(to: ~p"/monitor/login")

      {:error, :indisponivel} ->
        conn
        |> put_flash(:error, "Backend indisponível — tente novamente.")
        |> redirect(to: ~p"/monitor/login")
    end
  end

  def create(conn, _params), do: redirect(conn, to: ~p"/monitor/login")

  def delete(conn, _params) do
    conn
    |> clear_session()
    |> redirect(to: ~p"/monitor/login")
  end

  # Proxy ao Rust — 200 traz o access_token JWT, 401 credencial inválida.
  defp autenticar(email, senha) do
    url = "#{api_url()}/auth/staff/login"

    case Req.post(url, json: %{email: email, senha: senha}, receive_timeout: 5_000) do
      {:ok, %{status: 200, body: %{"access_token" => token}}} ->
        # Só aceita se o token for realmente staff (defesa em profundidade).
        with {:ok, claims} <- AuthJwt.verificar(token),
             true <- claims["tipo"] == "staff" do
          {:ok, token}
        else
          _ -> {:error, :credenciais}
        end

      {:ok, %{status: 401}} ->
        {:error, :credenciais}

      _ ->
        {:error, :indisponivel}
    end
  end

  defp api_url do
    Application.get_env(:motor_realtime, :backend_api_url) ||
      "http://localhost:8080/api/v1"
  end
end

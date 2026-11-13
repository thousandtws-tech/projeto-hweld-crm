defmodule MotorRealtimeWeb.Plugs.TokenServico do
  @moduledoc """
  Autentica o `/ingest` — endpoint interno, só o backend Rust publica.
  Bearer token compartilhado (`MOTOR_INGEST_TOKEN`) com comparação em
  tempo constante (`Plug.Crypto.secure_compare/2` — anti timing attack).
  """

  import Plug.Conn

  def init(opts), do: opts

  def call(conn, _opts) do
    with {:ok, esperado} <- token_configurado(),
         {:ok, recebido} <- bearer(conn),
         true <- Plug.Crypto.secure_compare(recebido, esperado) do
      conn
    else
      motivo ->
        motivo =
          case motivo do
            {:error, :token_ausente} -> :token_ausente
            false -> :token_invalido
            :error -> :sem_bearer
            _ -> :token_invalido
          end

        :telemetry.execute(
          [:motor_realtime, :ingest, :rejeitado],
          %{},
          %{motivo: motivo}
        )

        conn
        |> send_resp(401, Jason.encode!(%{erro: "nao_autenticado"}))
        |> halt()
    end
  end

  defp token_configurado do
    case Application.get_env(:motor_realtime, :ingest_token) do
      t when is_binary(t) and t != "" -> {:ok, t}
      _ -> {:error, :token_ausente}
    end
  end

  defp bearer(conn) do
    case get_req_header(conn, "authorization") do
      ["Bearer " <> token] -> {:ok, token}
      _ -> :error
    end
  end
end

defmodule MotorRealtimeWeb.Plugs.AutenticacaoMonitor do
  @moduledoc """
  Autentica o `/dashboard` — mesma credencial do `/ingest`
  (`MOTOR_INGEST_TOKEN`), mas aceita também `?token=` porque o
  navegador não envia `Authorization` em navegação comum.
  """

  import Plug.Conn

  def init(opts), do: opts

  def call(conn, _opts) do
    cond do
      # Sessão já autenticada — o LiveDashboard redireciona internamente
      # (/infra → /infra/home) e o `?token=` se perderia.
      sessao_autenticada?(conn) ->
        conn

      credencial_valida?(conn) ->
        if sessao_disponivel?(conn),
          do: put_session(conn, :motor_dashboard_auth, true),
          else: conn

      true ->
        conn
        |> put_resp_content_type("text/html")
        |> send_resp(
          401,
          "<!doctype html><meta charset=utf-8><title>401</title><body style=\"font-family:system-ui;background:#0b0f1a;color:#e5e7eb;display:grid;place-items:center;height:100vh;margin:0\"><div><h1>401 — dashboard protegido</h1><p>Acesse com <code>?token=</code> + o <code>MOTOR_INGEST_TOKEN</code>.</p></div>"
        )
        |> halt()
    end
  end

  defp credencial_valida?(conn) do
    with {:ok, esperado} <- token_configurado(),
         token when is_binary(token) and token != "" <-
           conn.params["token"] || bearer(conn) do
      Plug.Crypto.secure_compare(token, esperado)
    else
      _ -> false
    end
  end

  defp sessao_autenticada?(conn) do
    sessao_disponivel?(conn) and get_session(conn, :motor_dashboard_auth) == true
  end

  defp sessao_disponivel?(conn) do
    conn.private[:plug_session_fetch] == :done
  rescue
    _ -> false
  end

  defp bearer(conn) do
    case get_req_header(conn, "authorization") do
      ["Bearer " <> token] -> token
      _ -> nil
    end
  end

  defp token_configurado do
    case Application.get_env(:motor_realtime, :ingest_token) do
      t when is_binary(t) and t != "" -> {:ok, t}
      _ -> :error
    end
  end
end

defmodule MotorRealtimeWeb.Plugs.AutenticacaoStaff do
  @moduledoc """
  Autentica o painel `/monitor` — sessão com JWT staff válido
  (emitido pelo backend Rust no login). Sem sessão válida →
  redirect para a tela de login.
  """

  import Plug.Conn
  import Phoenix.Controller, only: [redirect: 2]

  alias MotorRealtimeWeb.Plugs.AuthJwt

  def init(opts), do: opts

  def call(conn, _opts) do
    case staff_da_sessao(conn) do
      {:ok, sujeito_id} -> assign(conn, :sujeito_id, sujeito_id)
      :error -> conn |> redirect(to: "/monitor/login") |> halt()
    end
  end

  @doc "JWT staff válido na sessão? Também usado pelo on_mount do LiveView."
  def staff_da_sessao(conn) do
    with token when is_binary(token) <- get_session(conn, :staff_token),
         {:ok, claims} <- AuthJwt.verificar(token),
         true <- claims["tipo"] == "staff",
         {sub, ""} when sub > 0 <- Integer.parse(to_string(claims["sub"])) do
      {:ok, sub}
    else
      _ -> :error
    end
  end
end

defmodule MotorRealtimeWeb.Plugs.AuthJwt do
  @moduledoc """
  Valida o JWT emitido pelo backend Rust (HS256, `JWT_SECRET` compartilhada).
  Claims do contrato: `sub` (id), `tipo` ("staff"|"portal"), `exp`, `iat`.

  Uso como plug de pipeline: `plug AuthJwt, tipo: :staff`.
  """

  import Plug.Conn

  def init(opts), do: Keyword.fetch!(opts, :tipo)

  def call(conn, tipo_esperado) do
    with {:ok, token} <- bearer(conn),
         {:ok, claims} <- verificar(token),
         true <- claims["tipo"] == Atom.to_string(tipo_esperado),
         {sub, ""} when sub > 0 <- Integer.parse(to_string(claims["sub"])) do
      conn
      |> assign(:sujeito_id, sub)
      |> assign(:sujeito_tipo, tipo_esperado)
    else
      _ ->
        conn
        |> send_resp(401, Jason.encode!(%{erro: "nao_autenticado"}))
        |> halt()
    end
  end

  @doc "Verifica assinatura + expiração do JWT. Expõe para o Channel/socket."
  @spec verificar(String.t()) :: {:ok, map()} | :error
  def verificar(token) do
    signer = Joken.Signer.create("HS256", secret())

    case Joken.verify_and_validate(%{}, token, signer) do
      {:ok, claims} -> {:ok, claims}
      {:error, _} -> :error
    end
  end

  defp secret do
    Application.get_env(:motor_realtime, :jwt_secret) ||
      raise "JWT_SECRET não configurada no motor realtime"
  end

  defp bearer(conn) do
    case get_req_header(conn, "authorization") do
      ["Bearer " <> token] -> {:ok, token}
      _ -> :error
    end
  end
end

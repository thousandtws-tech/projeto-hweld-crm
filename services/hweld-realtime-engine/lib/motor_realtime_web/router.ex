defmodule MotorRealtimeWeb.Router do
  use MotorRealtimeWeb, :router
  import Phoenix.LiveView.Router
  import Phoenix.LiveDashboard.Router

  pipeline :api do
    plug :accepts, ["json"]
  end

  # Ingest — só o backend Rust, autenticado por token de serviço.
  pipeline :ingest do
    plug :accepts, ["json"]
    plug MotorRealtimeWeb.Plugs.TokenServico
  end

  # Dashboard de monitoramento — mesmo token do ingest, mas aceita
  # `?token=` (navegador não envia Authorization em navegação comum).
  pipeline :monitor do
    plug MotorRealtimeWeb.Plugs.AutenticacaoMonitor
  end

  # LiveDashboard precisa de session + flash (LiveView) além do token.
  pipeline :livedash do
    plug :fetch_session
    plug :fetch_live_flash
    plug MotorRealtimeWeb.Plugs.AutenticacaoMonitor
  end

  # Painel LiveView — sessão cookie + CSRF + layout root.
  pipeline :browser do
    plug :fetch_session
    plug :fetch_live_flash
    plug :protect_from_forgery
    plug :put_secure_browser_headers
    plug :put_root_layout, html: {MotorRealtimeWeb.Layouts, :root}
  end

  # Área autenticada do painel — sessão staff válida obrigatória.
  pipeline :monitor_auth do
    plug :fetch_session
    plug :fetch_live_flash
    plug :protect_from_forgery
    plug :put_secure_browser_headers
    plug :put_root_layout, html: {MotorRealtimeWeb.Layouts, :root}
    plug MotorRealtimeWeb.Plugs.AutenticacaoStaff
  end

  # SSE por contexto de token — sem o plug :accepts (cliente pede
  # `text/event-stream`, não JSON).
  pipeline :staff do
    plug MotorRealtimeWeb.Plugs.AuthJwt, tipo: :staff
  end

  pipeline :portal do
    plug MotorRealtimeWeb.Plugs.AuthJwt, tipo: :portal
  end

  scope "/", MotorRealtimeWeb do
    pipe_through :api

    get "/", SaudeController, :index
    get "/login", SaudeController, :login
    get "/health", SaudeController, :show
  end

  scope "/", MotorRealtimeWeb do
    pipe_through :ingest

    post "/ingest", IngestController, :create
  end

  scope "/events", MotorRealtimeWeb do
    get "/publico", EventosController, :publico
  end

  scope "/events", MotorRealtimeWeb do
    pipe_through :staff

    get "/staff", EventosController, :staff
  end

  scope "/events", MotorRealtimeWeb do
    pipe_through :portal

    get "/portal", EventosController, :portal
  end

  scope "/dashboard", MotorRealtimeWeb do
    pipe_through :monitor

    get "/", DashboardController, :index
    get "/api", DashboardController, :api
  end

  # Painel oficial Phoenix — métricas Telemetry, processos, ETS, OS.
  scope "/" do
    pipe_through :livedash

    live_dashboard "/infra",
      metrics: MotorRealtimeWeb.Telemetry,
      ecto_repos: [],
      env_keys: []
  end

  # Monitor — login público, painel atrás de sessão staff.
  scope "/monitor", MotorRealtimeWeb do
    pipe_through :browser

    live "/login", LoginLive
    post "/login", SessaoController, :create
    delete "/logout", SessaoController, :delete
  end

  scope "/monitor", MotorRealtimeWeb do
    pipe_through :monitor_auth

    live_session :monitor,
      layout: {MotorRealtimeWeb.Layouts, :app},
      on_mount: [{MotorRealtimeWeb.Hooks.Auth, :staff}] do
      live "/", MonitorLive
      live "/eventos", EventosLive
    end
  end
end

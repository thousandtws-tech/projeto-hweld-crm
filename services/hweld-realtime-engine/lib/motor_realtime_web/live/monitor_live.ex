defmodule MotorRealtimeWeb.MonitorLive do
  @moduledoc """
  Painel de monitoramento em tempo real — LiveView ligada direto no
  PubSub do motor (push, sem polling).

    * feed de eventos — `stream` com prepend instantâneo;
    * cards — eventos, entregas, conexões vivas, ingest rejeitado;
    * "quem recebeu" — entregas por tópico em cada linha do feed;
    * conexões vivas — audiência + sujeito + tempo conectado;
    * ranking de tipos de evento — barras proporcionais.

  O processo LV assina `monitor:dashboard` (updates consolidados do
  `Monitor`) — o snapshot inicial vem do ring buffer do GenServer.
  """

  use MotorRealtimeWeb, :live_view

  alias MotorRealtime.Monitor
  alias Phoenix.PubSub

  @impl true
  def mount(_params, _session, socket) do
    snap = Monitor.snapshot()

    if connected?(socket) do
      PubSub.subscribe(MotorRealtime.PubSub, Monitor.topico_monitor())
    end

    socket =
      socket
      |> assign(
        page_title: "Monitoramento",
        online: false,
        resumo: %{
          conexoes: snap.conexoes,
          eventos_total: snap.eventos_total,
          entregas_total: snap.entregas_total,
          ingest_rejeitado: snap.ingest_rejeitado
        },
        conectados: snap.conectados,
        por_tipo: snap.por_tipo,
        rejeicoes: snap.rejeicoes,
        uptime_ms: snap.uptime_ms,
        filtro: nil
      )
      |> stream(:eventos, snap.recentes, dom_id: &"ev-#{&1.id}")

    {:ok, socket}
  end

  # Push do Monitor — {:monitor, {:evento, entrada} | :conexoes, resumo}
  @impl true
  def handle_info({:monitor, {:evento, entrada}, resumo}, socket) do
    {:noreply,
     socket
     |> assign(
       resumo: resumo,
       por_tipo: resumo.por_tipo,
       conectados: resumo.conectados,
       uptime_ms: resumo.uptime_ms,
       online: true
     )
     |> stream_insert(:eventos, entrada, at: 0)}
  end

  def handle_info({:monitor, :conexoes, resumo}, socket) do
    {:noreply,
     socket
     |> assign(
       resumo: resumo,
       conectados: resumo.conectados,
       uptime_ms: resumo.uptime_ms,
       online: true
     )}
  end

  @impl true
  def handle_event("filtrar", %{"tipo" => tipo}, socket) do
    {:noreply, assign(socket, filtro: if(tipo == socket.assigns.filtro, do: nil, else: tipo))}
  end

  defp fmt_uptime(ms) do
    s = div(ms, 1000)
    h = div(s, 3600)
    m = s |> rem(3600) |> div(60)

    cond do
      h > 0 -> "#{h}h #{m}m"
      m > 0 -> "#{m}m #{rem(s, 60)}s"
      true -> "#{s}s"
    end
  end

  defp fmt_hora(%DateTime{} = dt), do: Calendar.strftime(dt, "%H:%M:%S")

  defp cor_audiencia("staff"), do: "blue"
  defp cor_audiencia("todos"), do: "green"
  defp cor_audiencia(_empresa), do: "amber"

  defp cor_tipo(tipo) do
    cond do
      String.starts_with?(tipo, "pedido.") -> "blue"
      String.starts_with?(tipo, "pagamento.") -> "green"
      String.starts_with?(tipo, "fatura.") -> "orange"
      String.starts_with?(tipo, "nf.") -> "amber"
      String.starts_with?(tipo, "caixa.") -> "green"
      String.starts_with?(tipo, "fiscal.") -> "orange"
      String.starts_with?(tipo, "os.") -> "amber"
      String.starts_with?(tipo, "catalogo.") -> "slate"
      String.starts_with?(tipo, "notificacao.") -> "amber"
      true -> "slate"
    end
  end

  defp filtra(evento, nil), do: evento
  defp filtra(evento, prefixo), do: String.starts_with?(evento.tipo, prefixo) && evento

  @impl true
  def render(assigns) do
    ~H"""
    <div class="space-y-5">
      <!-- KPIs -->
      <div class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <.stat rotulo="Eventos" valor={@resumo.eventos_total} icone="bolt" tom="orange" />
        <.stat rotulo="Entregas" valor={@resumo.entregas_total} icone="send" />
        <.stat rotulo="Conexões" valor={@resumo.conexoes.staff + @resumo.conexoes.portal}
          icone="sensors" tom="blue" />
        <.stat rotulo="Staff" valor={@resumo.conexoes.staff} icone="admin_panel_settings" tom="blue" />
        <.stat rotulo="Portal" valor={@resumo.conexoes.portal} icone="storefront" tom="green" />
        <.stat rotulo="Rejeitados" valor={@resumo.ingest_rejeitado} icone="gpp_maybe" tom="red" />
      </div>

      <div class="grid gap-5 xl:grid-cols-[1fr_320px]">
        <!-- Feed de eventos -->
        <.panel>
          <:header>
            <div class="flex items-center justify-between">
              <span>Fluxo de eventos</span>
              <span class="text-[10px] normal-case tracking-normal text-slate-500">
                uptime {fmt_uptime(@uptime_ms)}
              </span>
            </div>
          </:header>

          <!-- filtro por domínio -->
          <div class="flex flex-wrap gap-1.5 border-b border-slate-800 px-4 py-2.5">
            <%= for dom <- ~w(pedido. pagamento. fatura. nf. caixa. estoque. fiscal. orcamento. os. empresa. catalogo. notificacao.) do %>
              <button
                phx-click="filtrar"
                phx-value-tipo={dom}
                class={[
                  "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                  @filtro == dom && "bg-orange-500/20 text-orange-300",
                  @filtro != dom && "text-slate-500 hover:bg-slate-800 hover:text-slate-300"
                ]}
              >
                {String.trim_trailing(dom, ".")}
              </button>
            <% end %>
            <button
              :if={@filtro}
              phx-click="filtrar"
              phx-value-tipo=""
              class="rounded-md px-2 py-1 text-[11px] text-slate-500 hover:text-slate-300"
            >
              ✕ limpar
            </button>
          </div>

          <div class="scroll-slim max-h-[560px] overflow-y-auto">
            <table class="w-full text-sm">
              <tbody id="feed-eventos" phx-update="stream">
                <tr
                  :for={{dom_id, e} <- @streams.eventos}
                  :if={filtra(e, @filtro)}
                  id={dom_id}
                  class="linha-nova border-b border-slate-800/60 last:border-0 hover:bg-slate-800/40"
                >
                  <td class="w-20 whitespace-nowrap px-4 py-2.5 text-xs tabular-nums text-slate-500">
                    {fmt_hora(e.em)}
                  </td>
                  <td class="px-2 py-2.5">
                    <.badge color={cor_tipo(e.tipo)}><span class="font-mono">{e.tipo}</span></.badge>
                  </td>
                  <td class="w-28 px-2 py-2.5">
                    <.badge color={cor_audiencia(e.audiencia)}>{e.audiencia}</.badge>
                  </td>
                  <td class="w-36 px-2 py-2.5 text-xs text-slate-400">
                    <span :for={{t, n} <- e.entregas} class="mr-2 whitespace-nowrap">
                      <span class="text-slate-600">{String.trim_leading(t, "eventos:")}</span>
                      <span class={["font-semibold", n > 0 && "text-emerald-400", n == 0 && "text-slate-600"]}>
                        ×{n}
                      </span>
                    </span>
                  </td>
                  <td class="max-w-0 truncate px-4 py-2.5 font-mono text-[11px] text-slate-500">
                    {Jason.encode!(e.dados)}
                  </td>
                </tr>
              </tbody>
            </table>
            <p
              :if={@resumo.eventos_total == 0}
              class="px-4 py-10 text-center text-sm text-slate-500"
            >
              Aguardando eventos — mutações no backend aparecem aqui instantaneamente.
            </p>
          </div>
        </.panel>

        <!-- Coluna lateral -->
        <div class="space-y-5">
          <.panel>
            <:header>Eventos por tipo</:header>
            <div class="space-y-1.5 px-4 py-3">
              <%= max = if @por_tipo != [], do: Enum.max_by(@por_tipo, & &1.total).total, else: 1 %>
              <div :for={item <- Enum.take(@por_tipo, 10)} class="flex items-center gap-2">
                <span class="w-40 truncate font-mono text-[11px] text-sky-300">{item.tipo}</span>
                <span class="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                  <span
                    class="block h-full rounded-full bg-gradient-to-r from-sky-500 to-orange-500 transition-all duration-500"
                    style={"width: #{round(item.total / max * 100)}%"}
                  />
                </span>
                <span class="w-8 text-right text-[11px] tabular-nums text-slate-400">
                  {item.total}
                </span>
              </div>
              <p :if={@por_tipo == []} class="py-4 text-center text-xs text-slate-600">
                sem eventos ainda
              </p>
            </div>
          </.panel>

          <.panel>
            <:header>Conexões vivas ({length(@conectados)})</:header>
            <div class="divide-y divide-slate-800/60">
              <div :for={c <- @conectados} class="flex items-center justify-between px-4 py-2.5">
                <span class="flex items-center gap-2 text-xs text-slate-300">
                  <.icon name={if c.audiencia == :portal, do: "storefront", else: "badge"}
                    class="text-base text-slate-500" />
                  sujeito #{c.sujeito}
                </span>
                <.badge color={if c.audiencia == :portal, do: "amber", else: "blue"}>
                  {c.audiencia}
                </.badge>
              </div>
              <p :if={@conectados == []} class="px-4 py-4 text-center text-xs text-slate-600">
                nenhuma conexão
              </p>
            </div>
          </.panel>

          <.panel :if={@rejeicoes != %{}}>
            <:header>Ingest rejeitado</:header>
            <div class="space-y-1 px-4 py-3 text-xs">
              <p :for={{motivo, n} <- @rejeicoes} class="flex justify-between">
                <span class="font-mono text-red-300">{motivo}</span>
                <span class="tabular-nums text-slate-400">{n}</span>
              </p>
            </div>
          </.panel>
        </div>
      </div>
    </div>
    """
  end
end

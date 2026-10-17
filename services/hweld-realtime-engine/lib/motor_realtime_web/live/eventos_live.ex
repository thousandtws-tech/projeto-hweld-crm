defmodule MotorRealtimeWeb.EventosLive do
  @moduledoc """
  Trilha de eventos do barramento — LiveView dedicada a explorar cada
  evento publicado (staff + portal + broadcast), com filtros dinâmicos:

    * chips de domínio derivados dos tipos já vistos (`pedido.`,
      `pagamento.`, `fatura.`, `nf.`... — tipos novos aparecem sozinhos);
    * filtro por audiência (staff | empresa | todos);
    * clique na linha expande o payload completo + entregas por tópico.

  Fonte: mesmo tópico `monitor:dashboard` do painel principal — zero
  polling, push via PubSub.
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
        page_title: "Eventos",
        online: false,
        resumo: %{
          eventos_total: snap.eventos_total,
          entregas_total: snap.entregas_total,
          ingest_rejeitado: snap.ingest_rejeitado
        },
        por_tipo: snap.por_tipo,
        filtro: nil,
        audiencia: nil,
        detalhe: nil
      )
      |> stream(:eventos, snap.recentes, dom_id: &"ev-#{&1.id}")

    {:ok, socket}
  end

  @impl true
  def handle_info({:monitor, {:evento, entrada}, resumo}, socket) do
    {:noreply,
     socket
     |> assign(
       resumo: resumo,
       por_tipo: resumo.por_tipo,
       online: true
     )
     |> stream_insert(:eventos, entrada, at: 0)}
  end

  def handle_info({:monitor, :conexoes, resumo}, socket) do
    {:noreply, assign(socket, resumo: resumo, online: true)}
  end

  @impl true
  def handle_event("filtrar", %{"dom" => dom}, socket) do
    {:noreply, assign(socket, filtro: if(dom == socket.assigns.filtro, do: nil, else: dom))}
  end

  def handle_event("audiencia", %{"escopo" => escopo}, socket) do
    {:noreply,
     assign(socket, audiencia: if(escopo == socket.assigns.audiencia, do: nil, else: escopo))}
  end

  def handle_event("detalhar", %{"id" => id}, socket) do
    id = String.to_integer(id)
    {:noreply, assign(socket, detalhe: if(id == socket.assigns.detalhe, do: nil, else: id))}
  end

  def handle_event("limpar", _params, socket) do
    {:noreply, assign(socket, filtro: nil, audiencia: nil)}
  end

  # Domínios dos tipos vistos (`pedido.confirmado` → `pedido.`) — cobre
  # qualquer tipo novo sem precisar atualizar a lista.
  defp dominios(por_tipo) do
    por_tipo
    |> Enum.map(&hd(String.split(&1.tipo, ".")))
    |> Enum.uniq()
    |> Enum.sort()
  end

  defp filtra(e, filtro, audiencia) do
    (filtro == nil or String.starts_with?(e.tipo, filtro <> ".")) and
      (audiencia == nil or e.audiencia == audiencia or
         String.starts_with?(e.audiencia, audiencia <> ":"))
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
      String.starts_with?(tipo, "notificacao.") -> "amber"
      true -> "slate"
    end
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="space-y-5">
      <div class="grid grid-cols-2 gap-3 md:grid-cols-3">
        <.stat rotulo="Eventos" valor={@resumo.eventos_total} icone="bolt" tom="orange" />
        <.stat rotulo="Entregas" valor={@resumo.entregas_total} icone="send" tom="blue" />
        <.stat rotulo="Rejeitados" valor={@resumo.ingest_rejeitado} icone="gpp_maybe" tom="red" />
      </div>

      <.panel>
        <:header>
          <div class="flex items-center justify-between">
            <span>Eventos do barramento</span>
            <span class="text-[10px] normal-case tracking-normal text-slate-500">
              {length(dominios(@por_tipo))} domínios ativos
            </span>
          </div>
        </:header>

        <!-- filtros: domínio (dinâmico) + audiência -->
        <div class="flex flex-wrap items-center gap-1.5 border-b border-slate-800 px-4 py-2.5">
          <span class="mr-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
            domínio
          </span>
          <button
            :for={dom <- dominios(@por_tipo)}
            phx-click="filtrar"
            phx-value-dom={dom}
            class={[
              "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
              @filtro == dom && "bg-orange-500/20 text-orange-300",
              @filtro != dom && "text-slate-500 hover:bg-slate-800 hover:text-slate-300"
            ]}
          >
            {dom}
          </button>
          <span class="mx-2 h-4 w-px bg-slate-800" />
          <span class="mr-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
            audiência
          </span>
          <button
            :for={esc <- ~w(staff empresa todos)}
            phx-click="audiencia"
            phx-value-escopo={esc}
            class={[
              "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
              @audiencia == esc && "bg-sky-500/20 text-sky-300",
              @audiencia != esc && "text-slate-500 hover:bg-slate-800 hover:text-slate-300"
            ]}
          >
            {esc}
          </button>
          <button
            :if={@filtro || @audiencia}
            phx-click="limpar"
            class="ml-auto rounded-md px-2 py-1 text-[11px] text-slate-500 hover:text-slate-300"
          >
            ✕ limpar
          </button>
        </div>

        <div class="scroll-slim max-h-[640px] overflow-y-auto">
          <table class="w-full text-sm">
            <tbody id="feed-eventos" phx-update="stream">
              <%= for {dom_id, e} <- @streams.eventos do %>
                <tr
                  :if={filtra(e, @filtro, @audiencia)}
                  id={dom_id}
                  phx-click="detalhar"
                  phx-value-id={e.id}
                  class="linha-nova cursor-pointer border-b border-slate-800/60 last:border-0 hover:bg-slate-800/40"
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
                  <td class="w-28 px-2 py-2.5 text-xs tabular-nums">
                    <span class={[
                      "font-semibold",
                      e.total_entregas > 0 && "text-emerald-400",
                      e.total_entregas == 0 && "text-slate-600"
                    ]}>
                      {e.total_entregas} entregas
                    </span>
                  </td>
                  <td class="max-w-0 truncate px-4 py-2.5 font-mono text-[11px] text-slate-500">
                    {Jason.encode!(e.dados)}
                  </td>
                </tr>
                <tr :if={@detalhe == e.id} class="border-b border-slate-800/60 bg-slate-900/60">
                  <td colspan="5" class="px-6 py-3">
                    <div class="grid gap-3 md:grid-cols-[1fr_220px]">
                      <div>
                        <p class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          payload
                        </p>
                        <pre class="scroll-slim max-h-48 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-sky-200"><%= Jason.encode!(e.dados, pretty: true) %></pre>
                      </div>
                      <div>
                        <p class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          entregas por tópico
                        </p>
                        <div class="space-y-1 text-xs">
                          <p :for={{t, n} <- e.entregas} class="flex justify-between gap-2">
                            <span class="truncate font-mono text-slate-400">{t}</span>
                            <span class={[
                              "tabular-nums font-semibold",
                              n > 0 && "text-emerald-400",
                              n == 0 && "text-slate-600"
                            ]}>
                              ×{n}
                            </span>
                          </p>
                          <p :if={e.entregas == %{}} class="text-slate-600">
                            nenhum tópico assinado
                          </p>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              <% end %>
            </tbody>
          </table>
          <p :if={@resumo.eventos_total == 0} class="px-4 py-10 text-center text-sm text-slate-500">
            Aguardando eventos — clique em uma linha para expandir o payload.
          </p>
        </div>
      </.panel>
    </div>
    """
  end
end

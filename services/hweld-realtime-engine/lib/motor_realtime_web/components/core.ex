defmodule MotorRealtimeWeb.Components.Core do
  @moduledoc """
  Design system do painel — componentes funcionais em Tailwind,
  no padrão das libs LiveView (Fluxon/Petal): atributos `variant`,
  `size`, slots nomeados e classes componíveis.

  Tema dark-first em `assets/css/app.css` (tokens `@theme`).
  """

  use Phoenix.Component

  @doc """
  Ícone Material Symbols — `icon="bolt"`.
  """
  attr :name, :string, required: true
  attr :class, :any, default: nil

  def icon(assigns) do
    ~H"""
    <span class={["material-symbols-outlined select-none", @class]} aria-hidden="true">
      {@name}
    </span>
    """
  end

  @doc """
  Botão do design system — `variant` (primary|ghost|danger), `size` (sm|md).
  """
  attr :type, :string, default: "button"
  attr :variant, :string, default: "primary"
  attr :size, :string, default: "md"
  attr :class, :string, default: nil
  attr :rest, :global, include: ~w(disabled phx-click phx-value-*)
  slot :inner_block, required: true

  def button(assigns) do
    ~H"""
    <button
      type={@type}
      class={[
        "inline-flex items-center justify-center gap-1.5 font-medium rounded-lg transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60 disabled:opacity-50 disabled:pointer-events-none",
        @size == "sm" && "text-xs px-2.5 py-1.5",
        @size == "md" && "text-sm px-3.5 py-2",
        @variant == "primary" && "bg-orange-600 text-white hover:bg-orange-500",
        @variant == "ghost" &&
          "text-slate-300 border border-slate-700 hover:border-slate-500 hover:text-white",
        @variant == "danger" && "bg-red-600/90 text-white hover:bg-red-500",
        @class
      ]}
      {@rest}
    >
      {render_slot(@inner_block)}
    </button>
    """
  end

  @doc "Badge semântico — `color` (blue|amber|green|red|slate|orange)."
  attr :color, :string, default: "slate"
  attr :class, :string, default: nil
  slot :inner_block, required: true

  def badge(assigns) do
    ~H"""
    <span class={[
      "inline-flex items-center gap-1 rounded-full font-medium",
      "px-2 py-0.5 text-[11px] leading-4 whitespace-nowrap",
      badge_color(@color),
      @class
    ]}>
      {render_slot(@inner_block)}
    </span>
    """
  end

  defp badge_color("blue"), do: "bg-sky-500/15 text-sky-300 ring-1 ring-inset ring-sky-500/30"

  defp badge_color("amber"),
    do: "bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/30"

  defp badge_color("green"),
    do: "bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30"

  defp badge_color("red"), do: "bg-red-500/15 text-red-300 ring-1 ring-inset ring-red-500/30"

  defp badge_color("orange"),
    do: "bg-orange-500/15 text-orange-300 ring-1 ring-inset ring-orange-500/30"

  defp badge_color(_), do: "bg-slate-500/15 text-slate-300 ring-1 ring-inset ring-slate-500/30"

  @doc "Painel de conteúdo — card escuro com borda e cabeçalho opcional."
  attr :class, :string, default: nil
  slot :header
  slot :inner_block, required: true

  def panel(assigns) do
    ~H"""
    <section class={[
      "rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur",
      @class
    ]}>
      <header
        :if={@header != []}
        class="border-b border-slate-800 px-5 py-3.5 text-xs font-semibold uppercase tracking-widest text-slate-400"
      >
        {render_slot(@header)}
      </header>
      {render_slot(@inner_block)}
    </section>
    """
  end

  @doc "KPI — cartão de métrica com rótulo, valor e ícone opcional."
  attr :rotulo, :string, required: true
  attr :valor, :any, required: true
  attr :icone, :string, default: nil
  attr :tom, :string, default: "slate"

  def stat(assigns) do
    ~H"""
    <div class="rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4">
      <div class="flex items-center justify-between">
        <span class="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
          {@rotulo}
        </span>
        <.icon :if={@icone} name={@icone} class={["text-lg", stat_cor(@tom)]} />
      </div>
      <p class={["mt-2 text-3xl font-bold tabular-nums", stat_cor(@tom)]}>{@valor}</p>
    </div>
    """
  end

  defp stat_cor("orange"), do: "text-orange-400"
  defp stat_cor("blue"), do: "text-sky-400"
  defp stat_cor("green"), do: "text-emerald-400"
  defp stat_cor("red"), do: "text-red-400"
  defp stat_cor(_), do: "text-slate-100"

  @doc "Input de formulário do painel."
  attr :field, :any, doc: "Phoenix.HTML.FormField ou nome"
  attr :type, :string, default: "text"
  attr :label, :string, default: nil
  attr :rest, :global, include: ~w(placeholder autocomplete required autofocus)

  def input(%{field: %Phoenix.HTML.FormField{} = field} = assigns) do
    assigns =
      assigns
      |> assign(:id, field.id)
      |> assign(:name, field.name)
      |> assign(:value, field.value)

    ~H"""
    <div class="space-y-1.5">
      <label :if={@label} for={@id} class="block text-xs font-medium text-slate-400">
        {@label}
      </label>
      <input
        id={@id}
        name={@name}
        type={@type}
        value={@value}
        class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
        {@rest}
      />
    </div>
    """
  end

  @doc "Indicador de conexão — ponto pulsante + rótulo."
  attr :online, :boolean, required: true

  def live_dot(assigns) do
    ~H"""
    <span class="inline-flex items-center gap-2 text-xs text-slate-400">
      <span class={[
        "relative inline-flex h-2.5 w-2.5 rounded-full",
        @online && "bg-emerald-400",
        !@online && "bg-red-500"
      ]}>
        <span
          :if={@online}
          class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60"
        />
      </span>
      {if @online, do: "ao vivo", else: "desconectado"}
    </span>
    """
  end
end

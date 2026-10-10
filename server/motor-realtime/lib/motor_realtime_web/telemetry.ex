defmodule MotorRealtimeWeb.Telemetry do
  use Supervisor
  import Telemetry.Metrics

  def start_link(arg) do
    Supervisor.start_link(__MODULE__, arg, name: __MODULE__)
  end

  @impl true
  def init(_arg) do
    children = [
      # Telemetry poller will execute the given period measurements
      # every 10_000ms. Learn more here: https://telemetry-metrics.hexdocs.pm
      {:telemetry_poller, measurements: periodic_measurements(), period: 10_000}
      # Add reporters as children of your supervision tree.
      # {Telemetry.Metrics.ConsoleReporter, metrics: metrics()}
    ]

    Supervisor.init(children, strategy: :one_for_one)
  end

  def metrics do
    [
      # Phoenix Metrics
      summary("phoenix.endpoint.start.system_time",
        unit: {:native, :millisecond}
      ),
      summary("phoenix.endpoint.stop.duration",
        unit: {:native, :millisecond}
      ),
      summary("phoenix.router_dispatch.start.system_time",
        tags: [:route],
        unit: {:native, :millisecond}
      ),
      summary("phoenix.router_dispatch.exception.duration",
        tags: [:route],
        unit: {:native, :millisecond}
      ),
      summary("phoenix.router_dispatch.stop.duration",
        tags: [:route],
        unit: {:native, :millisecond}
      ),
      summary("phoenix.socket_connected.duration",
        unit: {:native, :millisecond}
      ),
      sum("phoenix.socket_drain.count"),
      summary("phoenix.channel_joined.duration",
        unit: {:native, :millisecond}
      ),
      summary("phoenix.channel_handled_in.duration",
        tags: [:event],
        unit: {:native, :millisecond}
      ),

      # Motor — eventos publicados via /ingest e entregas por assinante
      counter("motor_realtime.evento.publicado.count", tags: [:tipo]),
      sum("motor_realtime.evento.publicado.entregas", tags: [:tipo]),

      # Motor — conexões SSE por audiência e rejeições do /ingest
      counter("motor_realtime.conexao.aberta.count", tags: [:audiencia]),
      counter("motor_realtime.conexao.fechada.count", tags: [:audiencia]),
      counter("motor_realtime.ingest.rejeitado.count", tags: [:motivo]),

      # Motor — conexões vivas neste instante (medido pelo poller)
      last_value("motor_realtime.conexoes.ativas.staff"),
      last_value("motor_realtime.conexoes.ativas.portal"),

      # VM Metrics
      summary("vm.memory.total", unit: {:byte, :kilobyte}),
      summary("vm.total_run_queue_lengths.total"),
      summary("vm.total_run_queue_lengths.cpu"),
      summary("vm.total_run_queue_lengths.io")
    ]
  end

  defp periodic_measurements do
    [
      # Conexões SSE vivas por audiência (gráfico last_value no LiveDashboard)
      {MotorRealtime.Monitor, :emitir_metricas, []}
    ]
  end
end

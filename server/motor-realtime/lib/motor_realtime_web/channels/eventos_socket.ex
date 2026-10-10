defmodule MotorRealtimeWeb.EventosSocket do
  @moduledoc """
  Socket WebSocket do motor — alternativa ao SSE para clientes que
  preferirem Phoenix Channels (mobile, CLIs, futuros clientes JS com
  `phoenix.js`). Mesma autenticação JWT dos endpoints SSE.

  Tópicos:
    * `eventos:staff`        — token `tipo: "staff"`
    * `eventos:empresa:{id}` — token `tipo: "portal"` cuja empresa == id
  """

  use Phoenix.Socket

  alias MotorRealtime.EmpresaResolver
  alias MotorRealtimeWeb.Plugs.AuthJwt

  channel "eventos:staff", MotorRealtimeWeb.StaffChannel
  channel "eventos:empresa:*", MotorRealtimeWeb.EmpresaChannel

  @impl true
  def connect(%{"token" => token}, socket, _connect_info) do
    with {:ok, claims} <- AuthJwt.verificar(token),
         {:ok, socket} <- autorizar(socket, claims) do
      {:ok, socket}
    else
      _ -> :error
    end
  end

  def connect(_params, _socket, _connect_info), do: :error

  defp autorizar(socket, %{"tipo" => "staff", "sub" => sub}) do
    {:ok, assign(socket, sujeito_tipo: :staff, sujeito_id: sub)}
  end

  defp autorizar(socket, %{"tipo" => "portal", "sub" => sub}) do
    case EmpresaResolver.empresa_do_contato(to_int(sub)) do
      {:ok, empresa_id} ->
        {:ok,
         assign(socket,
           sujeito_tipo: :portal,
           sujeito_id: sub,
           empresa_id: empresa_id
         )}

      :error ->
        :error
    end
  end

  defp autorizar(_socket, _claims), do: :error

  defp to_int(v) when is_integer(v), do: v
  defp to_int(v) when is_binary(v), do: String.to_integer(v)

  @impl true
  def id(_socket), do: nil
end

defmodule MotorRealtimeWeb.StaffChannel do
  @moduledoc "Canal `eventos:staff` — backoffice recebe tudo."

  use Phoenix.Channel
  alias MotorRealtime.Barramento

  @impl true
  def join("eventos:staff", _payload, socket) do
    if socket.assigns.sujeito_tipo == :staff do
      Barramento.assinar(Barramento.topico_staff())
      {:ok, socket}
    else
      {:error, %{reason: "sem_permissao"}}
    end
  end

  @impl true
  def handle_info(%MotorRealtime.Evento{} = e, socket) do
    push(socket, e.tipo, %{dados: e.dados})
    {:noreply, socket}
  end
end

defmodule MotorRealtimeWeb.EmpresaChannel do
  @moduledoc """
  Canal `eventos:empresa:{id}` — só entra se a empresa do token portal
  bater com o id do tópico. Também recebe o fluxo público `todos`.
  """

  use Phoenix.Channel
  alias MotorRealtime.Barramento

  @impl true
  def join("eventos:empresa:" <> id_str, _payload, socket) do
    with :portal <- socket.assigns.sujeito_tipo,
         {id, ""} <- Integer.parse(id_str),
         true <- socket.assigns.empresa_id == id do
      Barramento.assinar(Barramento.topico_empresa(id))
      Barramento.assinar(Barramento.topico_todos())
      {:ok, socket}
    else
      _ -> {:error, %{reason: "sem_permissao"}}
    end
  end

  @impl true
  def handle_info(%MotorRealtime.Evento{} = e, socket) do
    push(socket, e.tipo, %{dados: e.dados})
    {:noreply, socket}
  end
end

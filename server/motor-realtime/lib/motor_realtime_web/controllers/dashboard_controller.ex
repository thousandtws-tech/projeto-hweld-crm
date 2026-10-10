defmodule MotorRealtimeWeb.DashboardController do
  @moduledoc """
  Painel de observabilidade do motor — página única, dark, auto-refresh.

    * `GET /dashboard`     — HTML (polling `/dashboard/api` a cada 2s);
    * `GET /dashboard/api` — snapshot JSON do `MotorRealtime.Monitor`.

  Protegido pelo `MOTOR_INGEST_TOKEN` via `?token=` ou `Authorization`
  (plug `AutenticacaoMonitor` — a página guarda o token na sessionStorage
  e o reenvia nas chamadas da API).
  """

  use MotorRealtimeWeb, :controller

  alias MotorRealtime.Monitor

  def api(conn, _params) do
    json(conn, Monitor.snapshot())
  end

  def index(conn, _params) do
    conn
    |> put_resp_content_type("text/html")
    |> put_resp_header("cache-control", "no-store")
    |> send_resp(200, pagina())
  end

  defp pagina do
    """
    <!doctype html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>HWeld · Motor Realtime</title>
      <style>
        :root {
          --bg: #0b0f1a; --panel: #111827; --panel2: #0f1626; --borda: #1f2a44;
          --txt: #e5e7eb; --muted: #8b94a7; --accent: #ff6500; --azul: #3b82f6;
          --ok: #22c55e; --warn: #eab308; --err: #ef4444;
        }
        * { box-sizing: border-box; margin: 0 }
        body { background: var(--bg); color: var(--txt); font-family: system-ui, -apple-system, sans-serif; padding: 24px; }
        header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 12px }
        h1 { font-size: 20px; font-weight: 700 }
        h1 .tag { color: var(--accent) }
        .status { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted) }
        .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--ok); box-shadow: 0 0 8px var(--ok) }
        .dot.off { background: var(--err); box-shadow: 0 0 8px var(--err) }
        .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 20px }
        .card { background: var(--panel); border: 1px solid var(--borda); border-radius: 12px; padding: 16px }
        .card .rotulo { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin-bottom: 6px }
        .card .valor { font-size: 26px; font-weight: 700; font-variant-numeric: tabular-nums }
        .card .valor.accent { color: var(--accent) }
        .card .valor.azul { color: var(--azul) }
        .grid { display: grid; grid-template-columns: 1fr 340px; gap: 12px }
        @media (max-width: 980px) { .grid { grid-template-columns: 1fr } }
        .painel { background: var(--panel); border: 1px solid var(--borda); border-radius: 12px; overflow: hidden }
        .painel h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); padding: 14px 16px; border-bottom: 1px solid var(--borda) }
        table { width: 100%; border-collapse: collapse; font-size: 13px }
        th { text-align: left; color: var(--muted); font-weight: 600; font-size: 11px; text-transform: uppercase; padding: 10px 16px; border-bottom: 1px solid var(--borda) }
        td { padding: 9px 16px; border-bottom: 1px solid #16203a; vertical-align: top }
        tr:hover td { background: var(--panel2) }
        .tipo { font-family: ui-monospace, monospace; font-size: 12px; padding: 3px 8px; border-radius: 6px; background: #1e293b; color: #93c5fd; white-space: nowrap }
        .aud { font-size: 12px; color: var(--warn); white-space: nowrap }
        .ent { color: var(--ok); font-variant-numeric: tabular-nums }
        .ent.zero { color: var(--muted) }
        .dados { color: var(--muted); font-family: ui-monospace, monospace; font-size: 11px; max-width: 340px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
        .hora { color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap }
        .barra { display: flex; align-items: center; gap: 10px; padding: 7px 16px; font-size: 12px }
        .barra .t { width: 160px; font-family: ui-monospace, monospace; color: #93c5fd; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
        .barra .trilho { flex: 1; height: 6px; background: #16203a; border-radius: 3px; overflow: hidden }
        .barra .fill { height: 100%; background: linear-gradient(90deg, var(--azul), var(--accent)); border-radius: 3px; transition: width .4s }
        .barra .n { width: 36px; text-align: right; font-variant-numeric: tabular-nums; color: var(--muted) }
        .conn { padding: 10px 16px; border-bottom: 1px solid #16203a; font-size: 12px; display: flex; justify-content: space-between; align-items: center }
        .pill { font-size: 10px; padding: 2px 8px; border-radius: 999px; text-transform: uppercase; letter-spacing: .05em }
        .pill.staff { background: #1e3a5f; color: #93c5fd }
        .pill.portal { background: #3f2c10; color: #fbbf24 }
        .vazio { padding: 24px 16px; color: var(--muted); font-size: 13px; text-align: center }
        .flash { animation: flash .5s }
        @keyframes flash { from { background: #1c3a5e } }
      </style>
    </head>
    <body>
      <header>
        <h1>⚡ HWeld <span class="tag">Motor Realtime</span></h1>
        <div class="status">
          <a id="infra" href="#" style="color:var(--azul);font-size:12px;text-decoration:none">infra ↗</a>
          <span class="dot" id="dot"></span><span id="status">conectando…</span><span id="uptime"></span>
        </div>
      </header>
      <div class="cards" id="cards"></div>
      <div class="grid">
        <div class="painel">
          <h2>Fluxo de eventos <span id="tick" style="float:right;color:var(--muted);font-weight:400"></span></h2>
          <table>
            <thead><tr><th>Horário</th><th>Evento</th><th>Audiência</th><th>Entregas</th><th>Dados</th></tr></thead>
            <tbody id="recentes"></tbody>
          </table>
        </div>
        <div>
          <div class="painel" style="margin-bottom:12px"><h2>Eventos por tipo</h2><div id="tipos"><div class="vazio">aguardando eventos…</div></div></div>
          <div class="painel"><h2>Conexões vivas</h2><div id="conectados"><div class="vazio">nenhuma conexão</div></div></div>
        </div>
      </div>
      <script>
        const params = new URLSearchParams(location.search);
        const qtoken = params.get('token');
        if (qtoken) { sessionStorage.setItem('motor_token', qtoken); params.delete('token'); history.replaceState(null, '', location.pathname); }
        const TOKEN = sessionStorage.getItem('motor_token') || '';
        document.getElementById('infra').href = '/infra?token=' + encodeURIComponent(TOKEN);
        const api = () => fetch('/dashboard/api?token=' + encodeURIComponent(TOKEN)).then(r => { if (!r.ok) throw r.status; return r.json() });
        const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        const fmtUptime = ms => { const s = Math.floor(ms/1000), h = Math.floor(s/3600), m = Math.floor(s%3600/60); return h ? `${h}h ${m}m` : m ? `${m}m ${s%60}s` : `${s}s` };
        const fmtHora = iso => new Date(iso).toLocaleTimeString('pt-BR');
        let vistos = new Set(), falhas = 0;

        function card(rotulo, valor, cls='') { return `<div class="card"><div class="rotulo">${rotulo}</div><div class="valor ${cls}">${valor}</div></div>` }

        async function tick() {
          try {
            const s = await api(); falhas = 0;
            document.getElementById('dot').className = 'dot';
            document.getElementById('status').textContent = 'ao vivo';
            document.getElementById('uptime').textContent = '· uptime ' + fmtUptime(s.uptime_ms);
            const conx = s.conexoes.staff + s.conexoes.portal;
            document.getElementById('cards').innerHTML =
              card('Eventos publicados', s.eventos_total, 'accent') +
              card('Entregas a clientes', s.entregas_total) +
              card('Conexões vivas', conx, 'azul') +
              card('Staff', s.conexoes.staff) +
              card('Portal', s.conexoes.portal) +
              card('Ingest rejeitado', s.ingest_rejeitado, s.ingest_rejeitado ? '' : '');

            const max = s.por_tipo.length ? s.por_tipo[0].total : 1;
            document.getElementById('tipos').innerHTML = s.por_tipo.length
              ? s.por_tipo.slice(0, 12).map(e =>
                  `<div class="barra"><span class="t">${esc(e.tipo)}</span><span class="trilho"><span class="fill" style="width:${Math.round(e.total/max*100)}%"></span></span><span class="n">${e.total}</span></div>`).join('')
              : '<div class="vazio">aguardando eventos…</div>';

            document.getElementById('conectados').innerHTML = s.conectados.length
              ? s.conectados.map(c =>
                  `<div class="conn"><span>sujeito #${esc(c.sujeito)}</span><span class="pill ${c.audiencia}">${c.audiencia}</span></div>`).join('')
              : '<div class="vazio">nenhuma conexão</div>';

            const tbody = document.getElementById('recentes');
            tbody.innerHTML = s.recentes.map(e => {
              const novo = vistos.has(e.id) ? '' : ' class="flash"'; vistos.add(e.id);
              if (vistos.size > 500) vistos = new Set(s.recentes.map(x => x.id));
              return `<tr${novo}><td class="hora">${fmtHora(e.em)}</td><td><span class="tipo">${esc(e.tipo)}</span></td><td class="aud">${esc(e.audiencia)}</td><td class="ent ${e.total_entregas ? '' : 'zero'}">${e.total_entregas} ▸ ${esc(Object.entries(e.entregas).map(([k,v]) => k.replace('eventos:','') + '=' + v).join(' '))}</td><td class="dados">${esc(JSON.stringify(e.dados))}</td></tr>`;
            }).join('');
            document.getElementById('tick').textContent = new Date().toLocaleTimeString('pt-BR');
          } catch (e) {
            falhas++;
            document.getElementById('dot').className = 'dot off';
            document.getElementById('status').textContent = falhas > 2 ? 'motor fora do ar / token inválido' : 'reconectando…';
          }
        }
        tick(); setInterval(tick, 2000);
      </script>
    </body>
    </html>
    """
  end
end

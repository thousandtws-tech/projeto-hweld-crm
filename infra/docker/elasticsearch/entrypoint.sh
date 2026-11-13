#!/bin/sh
set -eu

# Railway monta volumes como root:root — ES roda como uid 1000 e falha com
# AccessDenied em node.lock. Aqui (PID 1 como root) ajustamos o dono do
# volume e depois dropamos privilégio para o entrypoint oficial.
chown -R elasticsearch:root /usr/share/elasticsearch/data 2>/dev/null || true
chown -R elasticsearch:root /usr/share/elasticsearch/logs 2>/dev/null || true

if command -v su-exec >/dev/null 2>&1; then
  exec su-exec elasticsearch /usr/local/bin/docker-entrypoint.sh eswrapper
fi
if command -v gosu >/dev/null 2>&1; then
  exec gosu elasticsearch /usr/local/bin/docker-entrypoint.sh eswrapper
fi
# `su` reseta o ambiente — reexporta o PATH do ES_HOME/bin que o entrypoint
# oficial espera (elasticsearch-keystore etc.).
exec su -s /bin/sh elasticsearch -c 'export PATH=/usr/share/elasticsearch/bin:$PATH; exec /usr/local/bin/docker-entrypoint.sh eswrapper'

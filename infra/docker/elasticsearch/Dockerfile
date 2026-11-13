# syntax=docker/dockerfile:1
# Wrapper p/ Elasticsearch no Railway: volumes são montados root-owned e o
# processo ES (uid 1000) não consegue escrever. O entrypoint corrige o dono
# e depois roda o entrypoint oficial como usuário elasticsearch.
FROM docker.elastic.co/elasticsearch/elasticsearch:8.19.0

USER root
COPY entrypoint.sh /usr/local/bin/hweld-es-entrypoint.sh
RUN chmod 0755 /usr/local/bin/hweld-es-entrypoint.sh

ENTRYPOINT ["/bin/tini", "--", "/usr/local/bin/hweld-es-entrypoint.sh"]

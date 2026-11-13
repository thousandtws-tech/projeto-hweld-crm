# syntax=docker/dockerfile:1

# ── Builder ───────────────────────────────────────────────────────────────
FROM maven:3.9-eclipse-temurin-25 AS builder

WORKDIR /build

# Cache de dependências — manifest primeiro.
COPY pom.xml ./
RUN mvn -q -B dependency:go-offline

COPY src ./src
RUN mvn -q -B package -DskipTests

# ── Runtime ───────────────────────────────────────────────────────────────
FROM eclipse-temurin:25-jre

RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/* && \
    useradd --create-home --shell /bin/false hweld

WORKDIR /app
COPY --from=builder /build/target/hweld-operations-api-*.jar /app/app.jar

USER hweld

EXPOSE 8090

# Railway injeta $PORT — o app binda nela (server.port=${PORT:8090}).
HEALTHCHECK --interval=15s --timeout=3s --start-period=45s --retries=10 \
  CMD curl -sf "http://localhost:${PORT:-8090}/actuator/health/liveness" || exit 1

ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]

package com.hweld.operations.shared.infrastructure.http;

import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerConfig;
import io.github.resilience4j.retry.Retry;
import io.github.resilience4j.retry.RetryConfig;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/** RestClients com timeouts explícitos e helpers Resilience4j (sem autoconfigure). */
@Configuration
public class HttpClientsConfig {

    @ConfigurationProperties(prefix = "hweld.core-api")
    public record CoreApiProps(String url, long timeoutMs, String edgeToken) {
        public CoreApiProps {
            if (timeoutMs <= 0) timeoutMs = 4000;
        }
    }

    @ConfigurationProperties(prefix = "hweld.motor")
    public record MotorProps(String url, String token, long timeoutMs) {
        public MotorProps {
            if (timeoutMs <= 0) timeoutMs = 1500;
        }
    }

    @Bean("coreApiClient")
    RestClient coreApiClient(CoreApiProps props) {
        return restClient(props.url(), props.timeoutMs());
    }

    @Bean("motorClient")
    RestClient motorClient(MotorProps props) {
        return restClient(props.url(), props.timeoutMs());
    }

    private RestClient restClient(String baseUrl, long timeoutMs) {
        java.net.http.HttpClient jdk = java.net.http.HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(Math.min(timeoutMs, 3000)))
                .build();
        var factory = new JdkClientHttpRequestFactory(jdk);
        factory.setReadTimeout(Duration.ofMillis(timeoutMs));
        return RestClient.builder().baseUrl(baseUrl).requestFactory(factory).build();
    }

    /** Retry com backoff exponencial para dependências transitórias (PSP, fiscal, e-mail). */
    public static Retry retry(String name, int maxAttempts) {
        return Retry.of(name, RetryConfig.custom()
                .maxAttempts(maxAttempts)
                .intervalFunction(io.github.resilience4j.core.IntervalFunction
                        .ofExponentialRandomBackoff(Duration.ofMillis(500), 2.0))
                .build());
    }

    /** Circuit breaker: 50% de falha em janela de 10 chamadas abre por 30s. */
    public static CircuitBreaker circuitBreaker(String name) {
        return CircuitBreaker.of(name, CircuitBreakerConfig.custom()
                .slidingWindowType(CircuitBreakerConfig.SlidingWindowType.COUNT_BASED)
                .slidingWindowSize(10)
                .failureRateThreshold(50f)
                .waitDurationInOpenState(Duration.ofSeconds(30))
                .permittedNumberOfCallsInHalfOpenState(3)
                .build());
    }
}

package com.hweld.operations;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.hweld.operations.billing.domain.BillingInvoiceRepository;
import com.hweld.operations.fiscal.domain.FiscalDocumentRepository;
import com.hweld.operations.notification.domain.NotificationDeliveryRepository;
import com.hweld.operations.payment.domain.PaymentRepository;
import com.sun.net.httpserver.HttpServer;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Fluxo ponta a ponta do serviço: cria cobrança PIX (JWT portal repassado ao
 * stub do core-api), recebe webhook assinado, confirma pagamento e verifica o
 * fan-out: billing PAID, notificação SENT, fiscal AUTHORIZED e o POST de
 * sincronização recebido pelo stub do core-api.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class OperationsFlowIT {

    @Container
    static final PostgreSQLContainer<?> PG = new PostgreSQLContainer<>("postgres:17-alpine")
            .withDatabaseName("hweld_ops").withUsername("hweld").withPassword("hweld");

    private static HttpServer coreApiStub;
    private static final List<String> internalEvents = new CopyOnWriteArrayList<>();
    private static final String WEBHOOK_SECRET = "dev-stub-webhook-secret";

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired PaymentRepository payments;
    @Autowired BillingInvoiceRepository billing;
    @Autowired NotificationDeliveryRepository deliveries;
    @Autowired FiscalDocumentRepository fiscal;

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) throws Exception {
        coreApiStub = HttpServer.create(new InetSocketAddress(0), 0);
        coreApiStub.createContext("/api/v1/portal/me", ex -> respond(ex, 200,
                "{\"contato\":{\"id\":42,\"nome\":\"Fulano\",\"email\":\"c@x.com\"},\"empresa\":{\"id\":7}}"));
        coreApiStub.createContext("/api/v1/portal/pedidos/10", ex -> respond(ex, 200,
                "{\"id\":10,\"numero\":\"PV-00010\",\"status\":\"aguardando_pagamento\",\"total\":\"199.90\"}"));
        coreApiStub.createContext("/api/v1/internal/eventos-financeiros", ex -> {
            internalEvents.add(new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            respond(ex, 202, "{\"aceito\":true}");
        });
        coreApiStub.start();

        r.add("spring.datasource.url", PG::getJdbcUrl);
        r.add("spring.datasource.username", PG::getUsername);
        r.add("spring.datasource.password", PG::getPassword);
        r.add("hweld.security.jwt-secret",
                () -> "0123456789abcdef0123456789abcdef-test-secret");
        r.add("hweld.core-api.url", () -> "http://localhost:" + coreApiStub.getAddress().getPort());
        r.add("hweld.motor.token", () -> "");
        r.add("hweld.fiscal.auto-emit-on-payment-confirmed", () -> "true");
        r.add("hweld.notification.email-provider", () -> "log");
        r.add("hweld.outbox.poll-interval-ms", () -> "300");
        r.add("hweld.notification.dispatch-interval-ms", () -> "300");
    }

    private static void respond(com.sun.net.httpserver.HttpExchange ex, int status, String body)
            throws java.io.IOException {
        byte[] b = body.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", "application/json");
        ex.sendResponseHeaders(status, b.length);
        ex.getResponseBody().write(b);
        ex.close();
    }

    @AfterAll
    static void stop() {
        if (coreApiStub != null) coreApiStub.stop(0);
    }

    private static String hmac(String body) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(WEBHOOK_SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return java.util.HexFormat.of().formatHex(mac.doFinal(body.getBytes(StandardCharsets.UTF_8)));
    }

    private org.springframework.test.web.servlet.request.RequestPostProcessor portalJwt() {
        return jwt().jwt(j -> j.subject("42").claim("tipo", "portal"))
                .authorities(new SimpleGrantedAuthority("ROLE_PORTAL"));
    }

    @Test
    void fluxoCompletoPagamentoPix() throws Exception {
        // 1) cria cobrança — o Java resolve o pedido no stub do core-api
        String body = mvc.perform(post("/api/v1/payments").with(portalJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"pedidoId\":10,\"method\":\"PIX\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.pixCopyPaste").isNotEmpty())
                .andReturn().getResponse().getContentAsString();
        JsonNode created = mapper.readTree(body);
        UUID paymentId = UUID.fromString(created.get("id").asText());
        String externalId = created.get("externalId").asText();

        // 2) idempotência: mesmo pedido+metodo retorna o mesmo pagamento
        String dup = mvc.perform(post("/api/v1/payments").with(portalJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"pedidoId\":10,\"method\":\"PIX\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        assertThat(mapper.readTree(dup).get("id").asText()).isEqualTo(paymentId.toString());

        // 3) webhook sem assinatura → rejeitado
        mvc.perform(post("/api/v1/webhooks/stub")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"eventId\":\"evt-bad\",\"externalId\":\"" + externalId + "\",\"status\":\"CONFIRMED\"}"))
                .andExpect(status().isUnauthorized());
        assertThat(payments.findById(paymentId).orElseThrow().getStatus().name())
                .isEqualTo("PENDING");

        // 4) webhook assinado → confirmado
        String whBody = "{\"eventId\":\"evt-ok-1\",\"externalId\":\"" + externalId + "\",\"status\":\"CONFIRMED\"}";
        mvc.perform(post("/api/v1/webhooks/stub")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-Signature", "sha256=" + hmac(whBody))
                        .content(whBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.resultado").value("processed"));
        assertThat(payments.findById(paymentId).orElseThrow().getStatus().name())
                .isEqualTo("CONFIRMED");

        // 5) reenvio do mesmo evento → duplicado, sem reprocessar
        mvc.perform(post("/api/v1/webhooks/stub")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-Signature", "sha256=" + hmac(whBody))
                        .content(whBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.duplicado").value(true));

        // 6) fan-out assíncrono via outbox: fatura paga, e-mail enviado,
        //    documento fiscal autorizado e core-api recebeu PaymentConfirmed
        await().atMost(Duration.ofSeconds(15)).until(() ->
                billing.findAll().stream().anyMatch(i -> i.getStatus().equals("PAID")));
        await().atMost(Duration.ofSeconds(15)).until(() ->
                deliveries.findAll().stream().anyMatch(d -> d.getStatus().equals("SENT")
                        && "payment_confirmed".equals(d.getTemplateCode())));
        await().atMost(Duration.ofSeconds(15)).until(() ->
                fiscal.findAll().stream().anyMatch(d -> d.getStatus().equals("AUTHORIZED")));
        await().atMost(Duration.ofSeconds(15)).until(() ->
                internalEvents.stream().anyMatch(e -> e.contains("PaymentConfirmed")));

        // 7) consulta do pagamento pelo portal (posse OK — mesma empresa)
        mvc.perform(get("/api/v1/payments/" + paymentId).with(portalJwt()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CONFIRMED"));

        // 8) portal sem bearer → 401/403
        mvc.perform(get("/api/v1/payments/" + paymentId)).andExpect(status().is4xxClientError());
    }

    @Test
    void internalEventsEhIdempotente() throws Exception {
        String event = "{\"eventId\":\"" + UUID.randomUUID() + "\",\"eventType\":\"OrderCreated\",\"aggregateId\":\"10\",\"payload\":{\"pedidoId\":10}}";
        mvc.perform(post("/api/v1/internal/events")
                        .header("X-Service-Token", "dev-internal-token")
                        .contentType(MediaType.APPLICATION_JSON).content(event))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.aceito").value(true));
        mvc.perform(post("/api/v1/internal/events")
                        .header("X-Service-Token", "dev-internal-token")
                        .contentType(MediaType.APPLICATION_JSON).content(event))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.duplicado").value(true));
        mvc.perform(post("/api/v1/internal/events")
                        .header("X-Service-Token", "errado")
                        .contentType(MediaType.APPLICATION_JSON).content(event))
                .andExpect(status().is4xxClientError());
    }
}

package com.hweld.operations.fiscal.infrastructure.focusnfe;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

/** Teste de contrato HTTP do client — servidor embutido do JDK, sem mocks. */
class FocusNFeClientTest {

    record Chamada(String method, String path, String auth, String body) {}

    private HttpServer server;
    private final List<Chamada> chamadas = new CopyOnWriteArrayList<>();
    private volatile int status = 200;
    private volatile String resposta = "{}";

    private FocusNFeClient client;

    @BeforeEach
    void setup() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", ex -> {
            String body = new String(ex.getRequestBody().readAllBytes(),
                    StandardCharsets.UTF_8);
            chamadas.add(new Chamada(ex.getRequestMethod(), ex.getRequestURI().toString(),
                    ex.getRequestHeaders().getFirst("Authorization"), body));
            byte[] bytes = resposta.getBytes(StandardCharsets.UTF_8);
            ex.getResponseHeaders().set("Content-Type", "application/json");
            ex.sendResponseHeaders(status, bytes.length);
            try (OutputStream os = ex.getResponseBody()) {
                os.write(bytes);
            }
        });
        server.start();

        int port = server.getAddress().getPort();
        var props = new FocusNFeProperties("homologacao",
                "http://127.0.0.1:" + port, "http://nao-usa", "tok-teste", null,
                false, 5000, 3000, null, null, null, null, null);
        client = new FocusNFeClient(props, new ObjectMapper());
    }

    @AfterEach
    void tearDown() {
        server.stop(0);
    }

    @Test
    void autenticacaoBasicComSenhaVazia() {
        String esperado = "Basic " + Base64.getEncoder()
                .encodeToString("tok-teste:".getBytes(StandardCharsets.UTF_8));
        resposta = "{\"status\":\"autorizado\"}";

        client.consultar("nfe", "ref-1");

        assertThat(chamadas).hasSize(1);
        assertThat(chamadas.get(0).auth()).isEqualTo(esperado);
    }

    @Test
    void emissaoPostaNoPathOficialComRef() {
        resposta = "{\"status\":\"processando_autorizacao\"}";

        var r = client.emitir("nfe", "doc-123", Map.of("natureza_operacao", "Venda"));

        assertThat(chamadas.get(0).method()).isEqualTo("POST");
        assertThat(chamadas.get(0).path()).isEqualTo("/v2/nfe?ref=doc-123");
        assertThat(chamadas.get(0).body()).contains("Venda");
        assertThat(r.path("status").asString()).isEqualTo("processando_autorizacao");
    }

    @Test
    void consultaUsaPathDeReferencia() {
        resposta = "{\"status\":\"autorizado\",\"chave_nfe\":\"123\"}";
        client.consultar("nfe", "abc");
        assertThat(chamadas.get(0).method()).isEqualTo("GET");
        assertThat(chamadas.get(0).path()).isEqualTo("/v2/nfe/abc");
    }

    @Test
    void cancelamentoEnviaJustificativaNoBody() {
        resposta = "{\"status\":\"cancelado\"}";
        client.cancelar("nfe", "abc", "nota emitida com erro de valor");
        assertThat(chamadas.get(0).method()).isEqualTo("DELETE");
        assertThat(chamadas.get(0).path()).isEqualTo("/v2/nfe/abc");
        assertThat(chamadas.get(0).body()).contains("justificativa");
    }

    @Test
    void erro400PreservaCodigoMensagemEErros() {
        status = 400;
        resposta = "{\"codigo\":\"invalid_payload\",\"mensagem\":\"payload inválido\","
                + "\"erros\":[{\"mensagem\":\"campo x ausente\"}]}";

        assertThatThrownBy(() -> client.emitir("nfe", "r1", Map.of()))
                .isInstanceOf(FocusNFeException.class)
                .satisfies(e -> {
                    var f = (FocusNFeException) e;
                    assertThat(f.codigo()).isEqualTo("invalid_payload");
                    assertThat(f.primeiraMensagem()).isEqualTo("campo x ausente");
                    assertThat(f.retriable()).isFalse();
                });
    }

    @Test
    void erro401ViraAutenticacao() {
        status = 401;
        resposta = "{\"codigo\":\"unauthorized\"}";

        assertThatThrownBy(() -> client.consultar("nfe", "r1"))
                .isInstanceOf(FocusNFeException.class)
                .satisfies(e -> assertThat(((FocusNFeException) e).codigo())
                        .isEqualTo("autenticacao"));
    }

    @Test
    void erro404ViraNaoEncontrado() {
        status = 404;
        resposta = "{\"codigo\":\"not_found\",\"mensagem\":\"ref inexistente\"}";

        assertThatThrownBy(() -> client.consultar("nfe", "r1"))
                .isInstanceOf(FocusNFeException.class)
                .satisfies(e -> assertThat(((FocusNFeException) e).codigo())
                        .isEqualTo("nao_encontrado"));
    }

    @Test
    void erro429ViraRateLimitRetriavel() {
        status = 429;
        resposta = "{}";

        assertThatThrownBy(() -> client.consultar("nfe", "r1"))
                .isInstanceOf(FocusNFeException.class)
                .satisfies(e -> {
                    var f = (FocusNFeException) e;
                    assertThat(f.codigo()).isEqualTo("rate_limit");
                    assertThat(f.retriable()).isTrue();
                });
    }

    @Test
    void erro500ViraProvedorRetriavel() {
        status = 500;
        resposta = "{\"mensagem\":\"internal\"}";

        assertThatThrownBy(() -> client.consultar("nfe", "r1"))
                .isInstanceOf(FocusNFeException.class)
                .satisfies(e -> {
                    var f = (FocusNFeException) e;
                    assertThat(f.codigo()).isEqualTo("provedor_indisponivel");
                    assertThat(f.retriable()).isTrue();
                });
    }
}

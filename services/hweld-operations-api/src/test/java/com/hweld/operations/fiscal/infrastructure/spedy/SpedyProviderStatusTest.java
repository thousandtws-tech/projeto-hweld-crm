package com.hweld.operations.fiscal.infrastructure.spedy;

import static org.assertj.core.api.Assertions.assertThat;

import com.hweld.operations.fiscal.domain.FiscalDocument;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

/**
 * Mapeamento do `status` oficial da nota Spedy (ciclo de vida) para o estado
 * interno — via `parseWebhook` (mesmo caminho do processamento de webhook).
 */
class SpedyProviderStatusTest {

    private final SpedyProvider provider = new SpedyProvider(
            null, null, null, null, null, new ObjectMapper());

    private FiscalDocument.Status statusDe(String providerStatus) throws Exception {
        var mapper = new ObjectMapper();
        var data = mapper.readTree(
                "{\"id\":\"inv-1\",\"status\":\"" + providerStatus + "\"}");
        return provider.parseWebhook(data).status();
    }

    @Test
    void mapeiaStatusOficiais() throws Exception {
        assertThat(statusDe("authorized")).isEqualTo(FiscalDocument.Status.AUTHORIZED);
        assertThat(statusDe("rejected")).isEqualTo(FiscalDocument.Status.REJECTED);
        assertThat(statusDe("canceled")).isEqualTo(FiscalDocument.Status.CANCELLED);
        assertThat(statusDe("enqueued")).isEqualTo(FiscalDocument.Status.PROCESSING);
        assertThat(statusDe("inContingent")).isEqualTo(FiscalDocument.Status.PROCESSING);
        assertThat(statusDe("error")).isEqualTo(FiscalDocument.Status.ERROR);
        assertThat(statusDe("desconhecido")).isEqualTo(FiscalDocument.Status.PROCESSING);
    }

    @Test
    void extraiProtocoloEChave() throws Exception {
        var mapper = new ObjectMapper();
        var data = mapper.readTree("""
            {"id":"inv-1","status":"authorized","number":105,"series":1,
             "accessKey":"3524011122233300018155001000000105",
             "authorization":{"protocol":"135250001234567"}}
            """);
        var r = provider.parseWebhook(data);
        assertThat(r.accessKey()).startsWith("3524");
        assertThat(r.protocol()).isEqualTo("135250001234567");
        assertThat(r.numero()).isEqualTo("105");
        assertThat(r.serie()).isEqualTo("1");
    }
}

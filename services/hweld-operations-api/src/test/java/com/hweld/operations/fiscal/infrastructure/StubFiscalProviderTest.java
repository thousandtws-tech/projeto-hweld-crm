package com.hweld.operations.fiscal.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;

import com.hweld.operations.fiscal.application.FiscalProvider;
import com.hweld.operations.fiscal.domain.FiscalDocument;
import com.hweld.operations.shared.application.ObjectStorage;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class StubFiscalProviderTest {

    /** ObjectStorage fake — captura puts em memória. */
    static class StorageFake implements ObjectStorage {
        final Map<String, byte[]> objetos = new HashMap<>();
        final Map<String, String> tipos = new HashMap<>();
        private final boolean ativo;

        StorageFake(boolean ativo) {
            this.ativo = ativo;
        }

        @Override
        public void salvar(String chave, byte[] conteudo, String contentType) {
            objetos.put(chave, conteudo);
            tipos.put(chave, contentType);
        }

        @Override
        public byte[] ler(String chave) {
            return objetos.get(chave);
        }

        @Override
        public void remover(String chave) {
            objetos.remove(chave);
        }

        @Override
        public boolean ativo() {
            return ativo;
        }
    }

    private static FiscalProvider.EmissionRequest req(String docId) {
        return new FiscalProvider.EmissionRequest(docId, "NFE", 42L, 7L, Map.of());
    }

    @Test
    void emissaoComStorageHospedaXmlEPdf() {
        var storage = new StorageFake(true);
        var provider = new StubFiscalProvider(storage);
        String docId = UUID.randomUUID().toString();

        var r = provider.requestEmission(req(docId));

        assertThat(r.status()).isEqualTo(FiscalDocument.Status.AUTHORIZED);
        assertThat(r.xmlUrl()).isEqualTo("fiscal/" + docId + ".xml");
        assertThat(r.pdfUrl()).isEqualTo("fiscal/" + docId + ".pdf");
        assertThat(r.accessKey()).hasSize(44);

        byte[] xml = storage.ler(r.xmlUrl());
        byte[] pdf = storage.ler(r.pdfUrl());
        assertThat(xml).isNotNull();
        assertThat(pdf).isNotNull();
        assertThat(new String(xml, StandardCharsets.UTF_8))
                .contains("<nfeProc").contains(r.accessKey()).contains(r.protocol());
        assertThat(new String(pdf, StandardCharsets.UTF_8)).startsWith("%PDF-");
        assertThat(storage.tipos.get(r.xmlUrl())).isEqualTo("application/xml");
        assertThat(storage.tipos.get(r.pdfUrl())).isEqualTo("application/pdf");
    }

    @Test
    void emissaoSemStorageRetornaChavesMasNaoGrava() {
        var storage = new StorageFake(false);
        var provider = new StubFiscalProvider(storage);

        var r = provider.requestEmission(req(UUID.randomUUID().toString()));

        assertThat(r.status()).isEqualTo(FiscalDocument.Status.AUTHORIZED);
        assertThat(r.xmlUrl()).startsWith("fiscal/");
        assertThat(storage.objetos).isEmpty();
    }
}

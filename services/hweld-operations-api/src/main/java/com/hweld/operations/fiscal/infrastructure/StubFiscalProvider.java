package com.hweld.operations.fiscal.infrastructure;

import com.hweld.operations.fiscal.application.FiscalProvider;
import com.hweld.operations.fiscal.domain.FiscalDocument;
import com.hweld.operations.shared.application.ObjectStorage;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Adapter de teste do port `FiscalProvider` — autoriza em memória com chave
 * de acesso no layout NF-e real (44 dígitos, DV módulo-11) e protocolo fake.
 * Gera XML/PDF sintéticos e hospeda no object storage (`fiscal/{id}.*`)
 * quando configurado — NÃO emite documento fiscal real; produção exige
 * adapter credenciado (ex.: Spedy) e homologação.
 */
@Component
public class StubFiscalProvider implements FiscalProvider {

    private static final Logger log = LoggerFactory.getLogger(StubFiscalProvider.class);
    public static final String NAME = "stub";

    private final ObjectStorage storage;

    public StubFiscalProvider(ObjectStorage storage) {
        this.storage = storage;
    }

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public EmissionResult requestEmission(EmissionRequest req) {
        String externalId = "stubfiscal_" + req.documentId();
        String chave = chaveFake(req.documentId());
        String protocolo = "135" + String.format("%012d", Math.abs(req.documentId().hashCode()) % 1_000_000_000_000L);
        String xmlKey = "fiscal/" + req.documentId() + ".xml";
        String pdfKey = "fiscal/" + req.documentId() + ".pdf";

        if (storage.ativo()) {
            storage.salvar(xmlKey, xmlSintetico(req, chave, protocolo), "application/xml");
            storage.salvar(pdfKey, pdfSintetico(req, chave), "application/pdf");
            log.info("fiscal stub: artefatos {} hospedados no storage", req.documentId());
        } else {
            log.warn("fiscal stub: storage ausente — {} sem XML/PDF físico", req.documentId());
        }

        return new EmissionResult(externalId, FiscalDocument.Status.AUTHORIZED,
                "autorizado", "autorizado (stub)", chave, protocolo, "1", "1",
                xmlKey, pdfKey, null,
                Map.of("externalId", externalId, "provider", NAME));
    }

    /** XML sintético no envelope NF-e — suficiente p/ testar download/parser. */
    private static byte[] xmlSintetico(EmissionRequest req, String chave, String protocolo) {
        String xml = """
                <?xml version="1.0" encoding="UTF-8"?>
                <nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
                  <NFe><infNFe Id="NFe%s" versao="4.00">
                    <ide><cUF>35</cUF><tpEmis>1</tpEmis><mod>55</mod></ide>
                    <emit><xNome>HWeld (STUB)</xNome></emit>
                    <det nItem="1"><prod><cProd>%s</cProd><xProd>Pedido %d</xProd></prod></det>
                    <total><ICMSTot><vNF>0.00</vNF></ICMSTot></total>
                  </infNFe></NFe>
                  <protNFe><infProt><chNFe>%s</chNFe><nProt>%s</nProt>
                  <cStat>100</cStat><xMotivo>Autorizado o uso da NF-e (stub)</xMotivo></infProt></protNFe>
                </nfeProc>
                """.formatted(chave, req.documentId(), req.pedidoId(), chave, protocolo);
        return xml.getBytes(StandardCharsets.UTF_8);
    }

    /** PDF mínimo estruturalmente válido (1 página, texto do protocolo). */
    private static byte[] pdfSintetico(EmissionRequest req, String chave) {
        String stream = "BT /F1 14 Tf 50 750 Td (DANFE STUB - doc %s - chave %s) Tj ET"
                .formatted(req.documentId(), chave);
        String pdf = "%PDF-1.4\n"
                + "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
                + "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
                + "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n"
                + "4 0 obj<</Length " + stream.length() + ">>stream\n" + stream + "\nendstream endobj\n"
                + "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n"
                + "trailer<</Root 1 0 R>>\n%%EOF\n";
        return pdf.getBytes(StandardCharsets.UTF_8);
    }

    @Override
    public StatusResult getStatus(String externalId) {
        return new StatusResult(FiscalDocument.Status.AUTHORIZED,
                "autorizado", null, null, null, null, null, null, null, null);
    }

    @Override
    public void cancel(String externalId, String motivo) {
        log.debug("stub fiscal: cancel {} motivo={}", externalId, motivo);
    }

    /** Chave NF-e 44 dígitos: cUF(2) AAMM(4) CNPJ(14) mod(2) serie(3) nNF(9) tpEmis(1) cNF(8) cDV(1). */
    private static String chaveFake(String documentId) {
        long n = Math.abs(documentId.hashCode());
        String base = String.format("3525010000000000000055001%09d1%08d", n % 1_000_000_000L, n % 100_000_000L);
        base = base.substring(0, 43);
        int soma = 0;
        char[] chars = new StringBuilder(base).reverse().toString().toCharArray();
        for (int i = 0; i < chars.length; i++) {
            soma += (chars[i] - '0') * ((i % 8) + 2);
        }
        int dv = 11 - (soma % 11);
        return base + (dv >= 10 ? 0 : dv);
    }
}

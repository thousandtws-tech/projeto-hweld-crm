package com.hweld.operations.fiscal.infrastructure;

import com.hweld.operations.fiscal.application.FiscalProvider;
import com.hweld.operations.fiscal.domain.FiscalDocument;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Adapter de teste do port `FiscalProvider` — autoriza em memória com chave
 * de acesso no layout NF-e real (44 dígitos, DV módulo-11) e protocolo fake.
 * NÃO emite documento fiscal real — produção exige adapter credenciado
 * (ex.: Focus NFe/Nuvem Fiscal) e homologação municipal/estadual.
 */
@Component
public class StubFiscalProvider implements FiscalProvider {

    private static final Logger log = LoggerFactory.getLogger(StubFiscalProvider.class);
    public static final String NAME = "stub";

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public EmissionResult requestEmission(EmissionRequest req) {
        String externalId = "stubfiscal_" + req.documentId();
        String chave = chaveFake(req.documentId());
        String protocolo = "135" + String.format("%012d", Math.abs(req.documentId().hashCode()) % 1_000_000_000_000L);
        return new EmissionResult(externalId, FiscalDocument.Status.AUTHORIZED, chave, protocolo,
                "fiscal/" + req.documentId() + ".xml", "fiscal/" + req.documentId() + ".pdf",
                null, Map.of("externalId", externalId, "provider", NAME));
    }

    @Override
    public StatusResult getStatus(String externalId) {
        return new StatusResult(FiscalDocument.Status.AUTHORIZED, null, null, null, null, null);
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

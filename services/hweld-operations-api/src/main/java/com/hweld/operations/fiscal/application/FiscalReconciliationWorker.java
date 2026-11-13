package com.hweld.operations.fiscal.application;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Reconciliação agendada de documentos não-terminais — cobre webhooks
 * perdidos e emissões inconclusivas (timeout pós-POST). Consulta pela
 * referência única; nunca reenvia emissão. `hweld.fiscal.reconcile-*`.
 */
@Component
public class FiscalReconciliationWorker {

    private static final Logger log = LoggerFactory.getLogger(FiscalReconciliationWorker.class);

    private final FiscalService service;

    public FiscalReconciliationWorker(FiscalService service) {
        this.service = service;
    }

    @Scheduled(fixedDelayString = "${hweld.fiscal.reconcile-interval-ms:120000}",
            initialDelayString = "${hweld.fiscal.reconcile-initial-delay-ms:30000}")
    public void reconcile() {
        try {
            int n = service.reconcilePending();
            if (n > 0) {
                log.info("fiscal: reconciliação consultou {} documento(s) pendente(s)", n);
            }
        } catch (Exception e) {
            log.warn("fiscal: ciclo de reconciliação falhou: {}", e.getMessage());
        }
    }
}

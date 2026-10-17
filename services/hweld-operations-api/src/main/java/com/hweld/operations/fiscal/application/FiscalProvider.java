package com.hweld.operations.fiscal.application;

import com.hweld.operations.fiscal.domain.FiscalDocument;
import java.util.Map;

/**
 * Port do provedor fiscal (NF-e/NFS-e via gateway — ex.: Focus NFe, Nuvem
 * Fiscal, ou integração SEFAZ direta). O contrato é deliberadamente genérico:
 * dados tributários concretos são construídos pelo adapter a partir da
 * `configuracao_fiscal` do core-api + dados do documento.
 */
public interface FiscalProvider {

    String name();

    EmissionResult requestEmission(EmissionRequest request);

    StatusResult getStatus(String externalId);

    void cancel(String externalId, String motivo);

    record EmissionRequest(
            String documentId,        // nosso UUID — idempotência no provedor
            String docType,
            Long pedidoId,
            Long empresaId,
            Map<String, Object> dados) {}

    record EmissionResult(
            String externalId,
            FiscalDocument.Status status,
            String accessKey,
            String protocol,
            String xmlUrl,
            String pdfUrl,
            String rejectionReason,
            Map<String, Object> raw) {}

    record StatusResult(
            FiscalDocument.Status status,
            String accessKey,
            String protocol,
            String xmlUrl,
            String pdfUrl,
            String rejectionReason) {}
}

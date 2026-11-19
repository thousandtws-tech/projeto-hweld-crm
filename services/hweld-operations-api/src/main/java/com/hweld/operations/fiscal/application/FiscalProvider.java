package com.hweld.operations.fiscal.application;

import com.hweld.operations.fiscal.domain.FiscalDocument;
import java.util.Map;

public interface FiscalProvider {

    String name();

    default String environment() { return "homologacao"; }

    default String providerRef(String documentId) { return null; }

    EmissionResult requestEmission(EmissionRequest request);

    StatusResult getStatus(String externalId);

    void cancel(String externalId, String motivo);

    default boolean configured() { return true; }

    default void cartaCorrecao(String externalId, String correcao) {
        throw new UnsupportedOperationException(
                "carta de correção não suportada pelo provedor " + name());
    }

    default Map<String, String> fetchArtifacts(String externalId, String documentId) {
        return Map.of();
    }

    default void requestNotificationResend(String externalId) {}

    record EmissionRequest(
            String documentId,       
            String docType,
            Long pedidoId,
            Long empresaId,
            Map<String, Object> dados) {}

    record EmissionResult(
            String externalId,
            FiscalDocument.Status status,
            String providerStatus,
            String statusDetail,
            String accessKey,
            String protocol,
            String numero,
            String serie,
            String xmlUrl,
            String pdfUrl,
            String rejectionReason,
            Map<String, Object> raw) {}

    record StatusResult(
            FiscalDocument.Status status,
            String providerStatus,
            String statusDetail,
            String accessKey,
            String protocol,
            String numero,
            String serie,
            String xmlUrl,
            String pdfUrl,
            String rejectionReason) {}
}

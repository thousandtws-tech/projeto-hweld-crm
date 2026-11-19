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

    /** Ambiente do provedor gravado em `fiscal_documents.environment`. */
    default String environment() { return "homologacao"; }

    /**
     * Referência única determinística da emissão (`ref` na Focus NFe) —
     * persistida em `external_id` ANTES do POST para reconciliação pós-falha.
     * `null` = o provedor atribui o identificador na resposta.
     */
    default String providerRef(String documentId) { return null; }

    EmissionResult requestEmission(EmissionRequest request);

    StatusResult getStatus(String externalId);

    void cancel(String externalId, String motivo);

    /**
     * `true` quando o adapter tem credenciais válidas para operar — usado
     * pela resolução `provider=auto` (primeiro configurado vence).
     */
    default boolean configured() { return true; }

    /** Carta de correção de NF-e — default: não suportada pelo adapter. */
    default void cartaCorrecao(String externalId, String correcao) {
        throw new UnsupportedOperationException(
                "carta de correção não suportada pelo provedor " + name());
    }

    /**
     * Baixa artefatos do provedor (XML/DANFE) para o object storage interno
     * e devolve as chaves persistidas — `{"xml": "fiscal/{id}.xml", ...}`.
     * Default = nada a fazer (ex.: stub já grava os artefatos na emissão).
     */
    default Map<String, String> fetchArtifacts(String externalId, String documentId) {
        return Map.of();
    }

    /** Pede ao provedor o reenvio das notificações do documento (webhook). */
    default void requestNotificationResend(String externalId) {}

    record EmissionRequest(
            String documentId,        // nosso UUID — idempotência no provedor
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

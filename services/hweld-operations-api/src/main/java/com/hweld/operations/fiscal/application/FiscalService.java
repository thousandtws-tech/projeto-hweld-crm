package com.hweld.operations.fiscal.application;

import com.hweld.operations.fiscal.domain.FiscalDocument;
import com.hweld.operations.fiscal.domain.FiscalDocumentRepository;
import com.hweld.operations.shared.application.EventTypes;
import com.hweld.operations.shared.application.IntegrationEvent;
import com.hweld.operations.shared.infrastructure.audit.AuditService;
import com.hweld.operations.shared.infrastructure.http.HttpClientsConfig;
import com.hweld.operations.shared.infrastructure.outbox.Outbox;
import com.hweld.operations.shared.interfaces.error.ApiException;
import com.hweld.operations.shared.interfaces.web.CorrelationIdFilter;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.retry.Retry;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Orquestra emissão/consulta/cancelamento de documentos fiscais junto ao
 * provedor configurado (`hweld.fiscal.provider`). Não calcula tributos —
 * apenas orquestra e registra protocolos/rejeições/autorizações.
 */
@Service
public class FiscalService {

    private static final Logger log = LoggerFactory.getLogger(FiscalService.class);

    @ConfigurationProperties(prefix = "hweld.fiscal")
    public record Props(String provider, boolean autoEmitOnPaymentConfirmed, String ambiente) {
        public Props {
            if (provider == null || provider.isBlank()) provider = "stub";
            if (ambiente == null) ambiente = "homologacao";
        }
    }

    private final FiscalDocumentRepository repository;
    private final Map<String, FiscalProvider> providers;
    private final Outbox outbox;
    private final AuditService audit;
    private final Props props;

    public FiscalService(FiscalDocumentRepository repository, List<FiscalProvider> providerList,
            Outbox outbox, AuditService audit, Props props) {
        this.repository = repository;
        this.providers = providerList.stream().collect(
                java.util.stream.Collectors.toMap(FiscalProvider::name, p -> p));
        this.outbox = outbox;
        this.audit = audit;
        this.props = props;
    }

    /**
     * Solicita emissão. Idempotente por (pedido, docType) — uma nova chamada
     * para pedido que já tem documento REQUESTED/PROCESSING/AUTHORIZED retorna
     * o existente.
     */
    @Transactional
    public FiscalDocument requestEmission(long pedidoId, long empresaId, UUID billingInvoiceId,
            Long notaFiscalId, FiscalDocument.DocType docType, Map<String, Object> dados) {

        var existente = repository.findByPedidoId(pedidoId, Pageable.ofSize(10)).stream()
                .filter(d -> d.getDocType().equals(docType.name()))
                .filter(d -> List.of("REQUESTED", "PROCESSING", "AUTHORIZED").contains(d.getStatus()))
                .findFirst();
        if (existente.isPresent()) {
            return existente.get();
        }

        FiscalDocument doc = new FiscalDocument(pedidoId, empresaId, billingInvoiceId,
                notaFiscalId, docType, props.provider());
        repository.save(doc);
        outbox.publish("fiscal_document", doc.getId().toString(), IntegrationEvent.of(
                EventTypes.FISCAL_DOC_REQUESTED, doc.getId().toString(),
                Map.of("fiscalDocumentId", doc.getId().toString(), "pedidoId", pedidoId,
                        "empresaId", empresaId, "docType", docType.name()),
                CorrelationIdFilter.current()));

        FiscalProvider provider = providers.get(props.provider());
        if (provider == null) {
            throw ApiException.validacao("provider fiscal desconhecido: " + props.provider());
        }
        try {
            FiscalProvider.EmissionRequest req = new FiscalProvider.EmissionRequest(
                    doc.getId().toString(), docType.name(), pedidoId, empresaId, dados);
            FiscalProvider.EmissionResult result = callProvider(provider,
                    () -> provider.requestEmission(req));
            doc.applyProviderResult(result.externalId(), result.status(), result.accessKey(),
                    result.protocol(), result.xmlUrl(), result.pdfUrl(),
                    result.rejectionReason(), result.raw());
        } catch (Exception e) {
            log.error("fiscal: emissão falhou doc {} pedido {}: {}", doc.getId(), pedidoId, e.getMessage());
            doc.applyProviderResult(null, FiscalDocument.Status.REJECTED, null, null,
                    null, null, "provider_indisponivel: " + e.getMessage(), null);
        }
        repository.save(doc);

        String eventType = switch (FiscalDocument.Status.valueOf(doc.getStatus())) {
            case AUTHORIZED -> EventTypes.INVOICE_AUTHORIZED;
            case REJECTED -> EventTypes.INVOICE_REJECTED;
            default -> null;
        };
        if (eventType != null) {
            outbox.publish("fiscal_document", doc.getId().toString(), IntegrationEvent.of(
                    eventType, doc.getId().toString(), docPayload(doc),
                    CorrelationIdFilter.current()));
        }
        audit.record("fiscal." + doc.getStatus().toLowerCase(), "fiscal_document",
                doc.getId().toString(), Map.of("pedidoId", pedidoId, "docType", docType.name()));
        return doc;
    }

    @Transactional(readOnly = true)
    public FiscalDocument get(UUID id) {
        return repository.findById(id)
                .orElseThrow(() -> ApiException.naoEncontrado("documento fiscal não encontrado"));
    }

    @Transactional(readOnly = true)
    public Page<FiscalDocument> list(Long pedidoId, String status, Pageable pageable) {
        if (pedidoId != null) return repository.findByPedidoId(pedidoId, pageable);
        if (status != null) return repository.findByStatus(status.toUpperCase(), pageable);
        return repository.findAll(pageable);
    }

    @Transactional
    public FiscalDocument cancel(UUID id, String motivo) {
        FiscalDocument doc = get(id);
        FiscalProvider provider = providers.get(doc.getProvider());
        if (doc.getExternalId() != null && provider != null) {
            callProvider(provider, () -> { provider.cancel(doc.getExternalId(), motivo); return null; });
        }
        doc.markCancelled();
        repository.save(doc);
        outbox.publish("fiscal_document", doc.getId().toString(), IntegrationEvent.of(
                EventTypes.INVOICE_FISCAL_CANCELLED, doc.getId().toString(), docPayload(doc),
                CorrelationIdFilter.current()));
        audit.record("fiscal.cancelled", "fiscal_document", id.toString(), Map.of("motivo", motivo));
        return doc;
    }

    /** Polling de status no provedor (documentos em PROCESSING). */
    @Transactional
    public FiscalDocument refresh(UUID id) {
        FiscalDocument doc = get(id);
        FiscalProvider provider = providers.get(doc.getProvider());
        if (provider == null || doc.getExternalId() == null) return doc;
        var remote = callProvider(provider, () -> provider.getStatus(doc.getExternalId()));
        if (remote != null && !remote.status().name().equals(doc.getStatus())) {
            doc.applyProviderResult(doc.getExternalId(), remote.status(), remote.accessKey(),
                    remote.protocol(), remote.xmlUrl(), remote.pdfUrl(), remote.rejectionReason(), null);
            repository.save(doc);
        }
        return doc;
    }

    private static Map<String, Object> docPayload(FiscalDocument doc) {
        var payload = new java.util.HashMap<String, Object>(Map.of(
                "fiscalDocumentId", doc.getId().toString(),
                "pedidoId", doc.getPedidoId(),
                "empresaId", doc.getEmpresaId(),
                "docType", doc.getDocType(),
                "status", doc.getStatus()));
        if (doc.getAccessKey() != null) payload.put("accessKey", doc.getAccessKey());
        if (doc.getXmlUrl() != null) payload.put("xmlUrl", doc.getXmlUrl());
        if (doc.getPdfUrl() != null) payload.put("pdfUrl", doc.getPdfUrl());
        if (doc.getRejectionReason() != null) payload.put("rejectionReason", doc.getRejectionReason());
        if (doc.getNotaFiscalId() != null) payload.put("notaFiscalId", doc.getNotaFiscalId());
        return payload;
    }

    private interface ProviderCall<T> { T run(); }

    private <T> T callProvider(FiscalProvider provider, ProviderCall<T> call) {
        Retry retry = HttpClientsConfig.retry("fiscal-" + provider.name(), 3);
        CircuitBreaker cb = HttpClientsConfig.circuitBreaker("fiscal-" + provider.name());
        return Retry.decorateSupplier(retry, CircuitBreaker.decorateSupplier(cb, call::run)).get();
    }
}

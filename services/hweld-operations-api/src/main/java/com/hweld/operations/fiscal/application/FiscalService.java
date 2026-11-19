package com.hweld.operations.fiscal.application;

import com.hweld.operations.fiscal.domain.FiscalDocument;
import com.hweld.operations.fiscal.domain.FiscalDocumentEvent;
import com.hweld.operations.fiscal.domain.FiscalDocumentEventRepository;
import com.hweld.operations.fiscal.domain.FiscalDocumentRepository;
import com.hweld.operations.fiscal.infrastructure.FiscalProviderException;
import com.hweld.operations.shared.application.EventTypes;
import com.hweld.operations.shared.application.IntegrationEvent;
import com.hweld.operations.shared.application.ObjectStorage;
import com.hweld.operations.shared.infrastructure.audit.AuditService;
import com.hweld.operations.shared.infrastructure.http.HttpClientsConfig;
import com.hweld.operations.shared.infrastructure.outbox.Outbox;
import com.hweld.operations.shared.interfaces.error.ApiException;
import com.hweld.operations.shared.interfaces.web.CorrelationIdFilter;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.retry.Retry;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
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

@Service
public class FiscalService {

    private static final Logger log = LoggerFactory.getLogger(FiscalService.class);

    @ConfigurationProperties(prefix = "hweld.fiscal")
    public record Props(String provider, boolean autoEmitOnPaymentConfirmed, String ambiente,
            long reconcileMinAgeMs, int reconcileBatchSize) {
        public Props {
            if (provider == null || provider.isBlank())
                provider = "stub";
            if (ambiente == null)
                ambiente = "homologacao";
            if (reconcileMinAgeMs <= 0)
                reconcileMinAgeMs = 60_000;
            if (reconcileBatchSize <= 0)
                reconcileBatchSize = 20;
        }
    }

    private final FiscalDocumentRepository repository;
    private final FiscalDocumentEventRepository events;
    private final Map<String, FiscalProvider> providers;
    private final Outbox outbox;
    private final AuditService audit;
    private final ObjectStorage storage;
    private final Props props;

    public FiscalService(FiscalDocumentRepository repository,
            FiscalDocumentEventRepository events, List<FiscalProvider> providerList,
            Outbox outbox, AuditService audit, ObjectStorage storage, Props props) {
        this.repository = repository;
        this.events = events;
        this.providers = providerList.stream().collect(
                java.util.stream.Collectors.toMap(FiscalProvider::name, p -> p));
        this.outbox = outbox;
        this.audit = audit;
        this.storage = storage;
        this.props = props;
    }

    @Transactional
    public FiscalDocument requestEmission(long pedidoId, long empresaId, UUID billingInvoiceId,
            Long notaFiscalId, FiscalDocument.DocType docType, Map<String, Object> dados) {

        var existente = repository.findAtivosPorPedidoEDocType(pedidoId, docType.name(),
                List.of("REQUESTED", "PROCESSING", "AUTHORIZED",
                        "CANCELLATION_PENDING", "REQUIRES_RECONCILIATION"))
                .stream().findFirst();
        if (existente.isPresent()) {
            return existente.get();
        }

        FiscalProvider provider = resolveProvider();

        FiscalDocument doc = new FiscalDocument(pedidoId, empresaId, billingInvoiceId,
                notaFiscalId, docType, provider.name());
        repository.save(doc);
        recordEvent(doc, FiscalDocumentEvent.Type.REQUESTED, null, "solicitação de emissão",
                Map.of("pedidoId", pedidoId, "docType", docType.name()));
        outbox.publish("fiscal_document", doc.getId().toString(), IntegrationEvent.of(
                EventTypes.FISCAL_DOC_REQUESTED, doc.getId().toString(),
                Map.of("fiscalDocumentId", doc.getId().toString(), "pedidoId", pedidoId,
                        "empresaId", empresaId, "docType", docType.name()),
                CorrelationIdFilter.current()));

        String ref = provider.providerRef(doc.getId().toString());
        doc.assignProviderRef(provider.environment(),
                ref != null ? ref : doc.getId().toString());
        repository.save(doc);

        Map<String, Object> dadosCompletos = new HashMap<>(dados != null ? dados : Map.of());
        if (notaFiscalId != null)
            dadosCompletos.put("nota_fiscal_id", notaFiscalId);

        try {
            FiscalProvider.EmissionRequest req = new FiscalProvider.EmissionRequest(
                    doc.getId().toString(), docType.name(), pedidoId, empresaId, dadosCompletos);
            FiscalProvider.EmissionResult result = callProviderOnce(provider,
                    () -> provider.requestEmission(req));
            aplicarResultadoEmissao(doc, result);
        } catch (FiscalProviderException e) {
            tratarFalhaProvider(doc, e);
        } catch (NFeValidationException e) {
            doc.applySync(FiscalDocument.Status.REJECTED, null, "validação local",
                    null, null, null, null, null, null,
                    String.join("; ", e.erros()), null);
            repository.save(doc);
            recordEvent(doc, FiscalDocumentEvent.Type.ERROR, "REQUESTED",
                    "dados fiscais inválidos: " + e.getMessage(), null);
            audit.record("fiscal.rejected", "fiscal_document", doc.getId().toString(),
                    Map.of("motivo", "validação local"));
            throw ApiException.validacao(e.getMessage());
        } catch (ApiException e) {
            doc.applySync(FiscalDocument.Status.REJECTED, null, "rejeitado na validação",
                    null, null, null, null, null, null, e.getMessage(), null);
            repository.save(doc);
            recordEvent(doc, FiscalDocumentEvent.Type.ERROR, "REQUESTED", e.getMessage(), null);
            audit.record("fiscal.rejected", "fiscal_document", doc.getId().toString(),
                    Map.of("motivo", e.getMessage()));
            throw e;
        } catch (Exception e) {
            log.error("fiscal: emissão inconclusiva doc {} pedido {}: {}",
                    doc.getId(), pedidoId, e.getMessage());
            doc.markReconciliation("desconhecido", truncar(e.getMessage()));
            repository.save(doc);
            recordEvent(doc, FiscalDocumentEvent.Type.ERROR, "REQUESTED",
                    "resultado inconclusivo: " + truncar(e.getMessage()), null);
        }
        return doc;
    }

    private FiscalProvider resolveProvider() {
        String wanted = props.provider() == null ? "auto" : props.provider().trim();
        if ("auto".equalsIgnoreCase(wanted)) {
            for (String nome : List.of("spedy")) {
                FiscalProvider p = providers.get(nome);
                if (p != null && p.configured())
                    return p;
            }
            wanted = "stub";
        }
        FiscalProvider provider = providers.get(wanted);
        if (provider == null) {
            throw ApiException.validacao("provider fiscal desconhecido: " + wanted);
        }
        return provider;
    }

    private void tratarFalhaProvider(FiscalDocument doc, FiscalProviderException e) {
        String anterior = doc.getStatus();
        if (e.inconclusivo() || e.retriable()) {
            doc.markReconciliation(e.codigo(), truncar(e.primeiraMensagem()));
            repository.save(doc);
            recordEvent(doc, FiscalDocumentEvent.Type.ERROR, anterior,
                    "emissão inconclusiva (" + e.codigo() + "): "
                            + truncar(e.primeiraMensagem()),
                    null);
        } else {
            doc.applySync(FiscalDocument.Status.REJECTED, e.codigo(), null,
                    null, null, null, null, null, null,
                    truncar(e.primeiraMensagem()), null);
            repository.save(doc);
            recordEvent(doc, FiscalDocumentEvent.Type.STATUS_CHANGE, anterior,
                    "rejeitado pelo provedor: " + truncar(e.primeiraMensagem()), null);
            publicarSeTerminal(doc);
            audit.record("fiscal.rejected", "fiscal_document", doc.getId().toString(),
                    Map.of("motivo", e.primeiraMensagem()));
        }
    }

    private void aplicarResultadoEmissao(FiscalDocument doc, FiscalProvider.EmissionResult result) {
        String anterior = doc.getStatus();
        doc.applySync(result.status(), result.providerStatus(), result.statusDetail(),
                result.accessKey(), result.protocol(), result.numero(), result.serie(),
                result.xmlUrl(), result.pdfUrl(), result.rejectionReason(), result.raw());
        if (result.externalId() != null) {
            doc.assignProviderRef(doc.getEnvironment(), result.externalId());
        }
        repository.save(doc);
        recordEvent(doc, FiscalDocumentEvent.Type.SUBMITTED, anterior,
                "emitido no provedor — status " + doc.getStatus()
                        + (doc.getProviderStatus() != null ? " (" + doc.getProviderStatus() + ")" : ""),
                result.raw());
        baixarArtefatosSeAutorizado(doc);
        publicarSeTerminal(doc);
        audit.record("fiscal." + doc.getStatus().toLowerCase(), "fiscal_document",
                doc.getId().toString(),
                Map.of("pedidoId", doc.getPedidoId(), "docType", doc.getDocType()));
    }

    @Transactional
    public FiscalDocument refresh(UUID id) {
        FiscalDocument doc = get(id);
        sincronizar(doc, FiscalDocumentEvent.Type.RECONCILE, "refresh manual");
        return doc;
    }

    @Transactional
    public boolean applyWebhookStatus(FiscalDocument doc, FiscalProvider.StatusResult remote) {
        if (doc.isTerminal() && remote.status().name().equals(doc.getStatus())) {
            return false;
        }
        if (doc.isTerminal()) {
            recordEvent(doc, FiscalDocumentEvent.Type.WEBHOOK, doc.getStatus(),
                    "status remoto " + remote.status() + " ignorado — documento terminal",
                    Map.of("providerStatus", String.valueOf(remote.providerStatus())));
            return false;
        }
        String anterior = doc.getStatus();
        if (statusRegrediu(anterior, remote.status())) {
            // Webhook atrasado (ex.: "processing" chegando depois de
            // "cancellation_pending") não pode rebobinar o documento —
            // ficaria preso num estado já superado.
            recordEvent(doc, FiscalDocumentEvent.Type.WEBHOOK, anterior,
                    "status remoto " + remote.status() + " ignorado — regressão (atual "
                            + anterior + ")",
                    Map.of("providerStatus", String.valueOf(remote.providerStatus())));
            return false;
        }
        doc.applySync(remote.status(), remote.providerStatus(), remote.statusDetail(),
                remote.accessKey(), remote.protocol(), remote.numero(), remote.serie(),
                remote.xmlUrl(), remote.pdfUrl(), remote.rejectionReason(), null);
        repository.save(doc);
        recordEvent(doc, FiscalDocumentEvent.Type.WEBHOOK, anterior,
                "status remoto " + remote.status()
                        + (remote.providerStatus() != null ? " (" + remote.providerStatus() + ")" : ""),
                null);
        baixarArtefatosSeAutorizado(doc);
        publicarSeTerminal(doc);
        return !anterior.equals(doc.getStatus());
    }

    /**
     * Webhook atrasado não pode rebobinar a máquina de estados: o provedor
     * envia eventos fora de ordem e um "processing" tardio não pode
     * sobrescrever "cancellation_pending"/"authorized".
     */
    private static boolean statusRegrediu(String atual, FiscalDocument.Status remoto) {
        return switch (remoto) {
            case REQUESTED, PROCESSING ->
                    !"REQUESTED".equals(atual) && !"PROCESSING".equals(atual);
            case AUTHORIZED ->
                    !"REQUESTED".equals(atual) && !"PROCESSING".equals(atual)
                            && !"REQUIRES_RECONCILIATION".equals(atual) && !"ERROR".equals(atual);
            case REJECTED ->
                    java.util.List.of("AUTHORIZED", "CANCELLATION_PENDING",
                            "CANCELLED", "REJECTED").contains(atual);
            case CANCELLATION_PENDING -> !"AUTHORIZED".equals(atual);
            case CANCELLED, ERROR, REQUIRES_RECONCILIATION -> false;
        };
    }

    @Transactional
    public int reconcilePending() {
        var pendentes = repository.findTop50ByStatusInOrderByUpdatedAtAsc(List.of(
                "REQUESTED", "PROCESSING", "REQUIRES_RECONCILIATION", "CANCELLATION_PENDING"));
        Instant corte = Instant.now().minus(Duration.ofMillis(props.reconcileMinAgeMs()));
        int processados = 0;
        for (FiscalDocument doc : pendentes) {
            if (processados >= props.reconcileBatchSize())
                break;
            if (doc.getUpdatedAt().isAfter(corte))
                break;
            try {
                sincronizar(doc, FiscalDocumentEvent.Type.RECONCILE, "reconciliação agendada");
                processados++;
            } catch (Exception e) {
                log.warn("fiscal: reconciliação doc {} falhou: {}", doc.getId(), e.getMessage());
            }
        }
        return processados;
    }

    private void sincronizar(FiscalDocument doc, FiscalDocumentEvent.Type tipo, String origem) {
        FiscalProvider provider = providers.get(doc.getProvider());
        if (provider == null) {
            throw ApiException.validacao("provider desconhecido: " + doc.getProvider());
        }
        if (doc.getExternalId() == null) {
            doc.applySync(FiscalDocument.Status.ERROR, null, "sem referência de provedor",
                    null, null, null, null, null, null, doc.getRejectionReason(), null);
            repository.save(doc);
            recordEvent(doc, tipo, null, "sem external_id — " + origem, null);
            return;
        }
        FiscalProvider.StatusResult remote;
        try {
            remote = callProviderRead(provider, () -> provider.getStatus(doc.getExternalId()));
        } catch (FiscalProviderException e) {
            if (e.httpStatus() == 404) {
                String anterior = doc.getStatus();
                doc.applySync(FiscalDocument.Status.ERROR, e.codigo(),
                        "referência ausente no provedor — emissão não recebida",
                        null, null, null, null, null, null,
                        truncar(e.primeiraMensagem()), null);
                repository.save(doc);
                recordEvent(doc, tipo, anterior, "ref não encontrada (" + origem + ")", null);
                return;
            }
            throw e;
        }
        if (remote == null)
            return;
        boolean mudou = applyWebhookStatus(doc, remote);
        if (mudou) {
            audit.record("fiscal." + doc.getStatus().toLowerCase(), "fiscal_document",
                    doc.getId().toString(), Map.of("origem", origem));
        }
    }

    private void baixarArtefatosSeAutorizado(FiscalDocument doc) {
        if (!FiscalDocument.Status.AUTHORIZED.name().equals(doc.getStatus())
                && !FiscalDocument.Status.CANCELLED.name().equals(doc.getStatus())) {
            return;
        }
        if (doc.getXmlUrl() != null && doc.getPdfUrl() != null)
            return; // já hospedados
        FiscalProvider provider = providers.get(doc.getProvider());
        if (provider == null || doc.getExternalId() == null)
            return;
        try {
            var chaves = provider.fetchArtifacts(doc.getExternalId(), doc.getId().toString());
            if (!chaves.isEmpty()) {
                doc.applyArtifacts(chaves.get("xml"), chaves.get("pdf"));
                repository.save(doc);
                recordEvent(doc, FiscalDocumentEvent.Type.ARTIFACT, null,
                        "artefatos hospedados: " + chaves.keySet(), null);
            }
        } catch (Exception e) {
            log.warn("fiscal: fetchArtifacts doc {} falhou: {}", doc.getId(), e.getMessage());
        }
    }

    @Transactional
    public FiscalDocument cancel(UUID id, String motivo) {
        FiscalDocument doc = get(id);
        if (!doc.cancelavel()) {
            throw ApiException.validacao(
                    "documento " + doc.getStatus() + " não pode ser cancelado");
        }
        FiscalProvider provider = providers.get(doc.getProvider());
        if (provider == null || doc.getExternalId() == null) {
            throw ApiException.validacao("documento sem referência no provedor");
        }
        doc.markCancellationPending();
        repository.save(doc);
        recordEvent(doc, FiscalDocumentEvent.Type.CANCEL, "AUTHORIZED",
                "cancelamento solicitado: " + truncar(motivo), null);
        try {
            callProviderOnce(provider, () -> {
                provider.cancel(doc.getExternalId(), motivo);
                return null;
            });
        } catch (FiscalProviderException e) {
            if (e.inconclusivo() || e.retriable()) {
                recordEvent(doc, FiscalDocumentEvent.Type.ERROR, null,
                        "cancelamento inconclusivo: " + truncar(e.primeiraMensagem()), null);
                return doc;
            }
            doc.applySync(FiscalDocument.Status.AUTHORIZED, e.codigo(), null,
                    null, null, null, null, null, null,
                    truncar(e.primeiraMensagem()), null);
            repository.save(doc);
            recordEvent(doc, FiscalDocumentEvent.Type.ERROR, "CANCELLATION_PENDING",
                    "cancelamento rejeitado: " + truncar(e.primeiraMensagem()), null);
            throw ApiException.validacao("cancelamento rejeitado: " + e.primeiraMensagem());
        }
        doc.applySync(FiscalDocument.Status.CANCELLED, null, motivo,
                null, null, null, null, null, null, null, null);
        repository.save(doc);
        recordEvent(doc, FiscalDocumentEvent.Type.CANCEL, "CANCELLATION_PENDING",
                "cancelado — " + truncar(motivo), null);
        publicarSeTerminal(doc);
        audit.record("fiscal.cancelled", "fiscal_document", id.toString(), Map.of("motivo", motivo));
        return doc;
    }

    @Transactional
    public void cartaCorrecao(UUID id, String correcao) {
        FiscalDocument doc = get(id);
        if (!FiscalDocument.Status.AUTHORIZED.name().equals(doc.getStatus())) {
            throw ApiException.validacao("carta de correção exige documento autorizado");
        }
        FiscalProvider provider = providers.get(doc.getProvider());
        if (provider == null) {
            throw ApiException.validacao(
                    "provedor do documento indisponível: " + doc.getProvider());
        }
        try {
            provider.cartaCorrecao(doc.getExternalId(), correcao);
        } catch (UnsupportedOperationException e) {
            throw ApiException.validacao(e.getMessage());
        }
        recordEvent(doc, FiscalDocumentEvent.Type.STATUS_CHANGE, null,
                "carta de correção registrada", Map.of("correcao", correcao == null ? "" : correcao));
        audit.record("fiscal.carta_correcao", "fiscal_document", id.toString(), Map.of());
    }

    @Transactional
    public void requestNotificationResend(UUID id) {
        FiscalDocument doc = get(id);
        FiscalProvider provider = providers.get(doc.getProvider());
        if (provider == null || doc.getExternalId() == null) {
            throw ApiException.validacao("documento sem referência no provedor");
        }
        provider.requestNotificationResend(doc.getExternalId());
        recordEvent(doc, FiscalDocumentEvent.Type.WEBHOOK, null,
                "reenvio de notificação solicitado", null);
        audit.record("fiscal.webhook_resend", "fiscal_document", id.toString(), Map.of());
    }

    @Transactional(readOnly = true)
    public byte[] artefato(UUID id, String tipo) {
        FiscalDocument doc = get(id);
        String chave = switch (tipo) {
            case "xml" -> doc.getXmlUrl();
            case "pdf" -> doc.getPdfUrl();
            default -> null;
        };
        if (chave == null || !chave.startsWith("fiscal/")) {
            return null;
        }
        return storage.ler(chave);
    }

    @Transactional(readOnly = true)
    public FiscalDocument get(UUID id) {
        return repository.findById(id)
                .orElseThrow(() -> ApiException.naoEncontrado("documento fiscal não encontrado"));
    }

    @Transactional(readOnly = true)
    public Page<FiscalDocument> list(Long pedidoId, String status, Pageable pageable) {
        if (pedidoId != null)
            return repository.findByPedidoId(pedidoId, pageable);
        if (status != null)
            return repository.findByStatus(status.toUpperCase(), pageable);
        return repository.findAll(pageable);
    }

    @Transactional(readOnly = true)
    public List<FiscalDocumentEvent> historico(UUID id) {
        return events.findByFiscalDocumentIdOrderByCreatedAtAsc(id);
    }

    private void publicarSeTerminal(FiscalDocument doc) {
        String eventType = switch (FiscalDocument.Status.valueOf(doc.getStatus())) {
            case AUTHORIZED -> EventTypes.INVOICE_AUTHORIZED;
            case REJECTED -> EventTypes.INVOICE_REJECTED;
            case CANCELLED -> EventTypes.INVOICE_FISCAL_CANCELLED;
            default -> null;
        };
        if (eventType != null) {
            outbox.publish("fiscal_document", doc.getId().toString(), IntegrationEvent.of(
                    eventType, doc.getId().toString(), docPayload(doc),
                    CorrelationIdFilter.current()));
        }
    }

    private void recordEvent(FiscalDocument doc, FiscalDocumentEvent.Type type,
            String statusFrom, String message, Map<String, Object> payload) {
        events.save(new FiscalDocumentEvent(doc.getId(), type,
                statusFrom, doc.getStatus(), doc.getProviderStatus(), message, payload));
    }

    private static Map<String, Object> docPayload(FiscalDocument doc) {
        var payload = new HashMap<String, Object>(Map.of(
                "fiscalDocumentId", doc.getId().toString(),
                "pedidoId", doc.getPedidoId(),
                "empresaId", doc.getEmpresaId(),
                "docType", doc.getDocType(),
                "status", doc.getStatus()));
        payload.put("provider", doc.getProvider());
        payload.put("environment", doc.getEnvironment());
        if (doc.getProviderStatus() != null)
            payload.put("providerStatus", doc.getProviderStatus());
        if (doc.getStatusDetail() != null)
            payload.put("statusDetail", doc.getStatusDetail());
        if (doc.getAccessKey() != null)
            payload.put("accessKey", doc.getAccessKey());
        if (doc.getProtocol() != null)
            payload.put("protocol", doc.getProtocol());
        if (doc.getNumero() != null)
            payload.put("numero", doc.getNumero());
        if (doc.getSerie() != null)
            payload.put("serie", doc.getSerie());
        if (doc.getXmlUrl() != null)
            payload.put("xmlUrl", doc.getXmlUrl());
        if (doc.getPdfUrl() != null)
            payload.put("pdfUrl", doc.getPdfUrl());
        if (doc.getRejectionReason() != null)
            payload.put("rejectionReason", doc.getRejectionReason());
        if (doc.getNotaFiscalId() != null)
            payload.put("notaFiscalId", doc.getNotaFiscalId());
        return payload;
    }

    private static String truncar(String s) {
        if (s == null)
            return null;
        return s.length() <= 400 ? s : s.substring(0, 400);
    }

    private interface ProviderCall<T> {
        T run();
    }

    private <T> T callProviderOnce(FiscalProvider provider, ProviderCall<T> call) {
        return call.run();
    }

    private <T> T callProviderRead(FiscalProvider provider, ProviderCall<T> call) {
        Retry retry = HttpClientsConfig.retry("fiscal-" + provider.name(), 3);
        CircuitBreaker cb = HttpClientsConfig.circuitBreaker("fiscal-" + provider.name());
        return Retry.decorateSupplier(retry, CircuitBreaker.decorateSupplier(cb, call::run)).get();
    }
}

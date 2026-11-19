package com.hweld.operations.fiscal.application;

import com.hweld.operations.fiscal.domain.FiscalDocument;
import com.hweld.operations.fiscal.domain.FiscalDocumentEvent;
import com.hweld.operations.fiscal.domain.FiscalDocumentEventRepository;
import com.hweld.operations.fiscal.domain.FiscalDocumentRepository;
import com.hweld.operations.fiscal.infrastructure.FiscalProviderException;
import com.hweld.operations.fiscal.infrastructure.focusnfe.NFeMapper.NFeValidationException;
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
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Orquestra emissão/consulta/cancelamento de documentos fiscais junto ao
 * provedor configurado (`hweld.fiscal.provider`). Não calcula tributos —
 * apenas orquestra e registra protocolos/rejeições/autorizações.
 *
 * Semântica de emissão com provedor real (Focus NFe):
 * - `external_id` = `ref` determinística persistida ANTES do POST — timeout
 *   nunca é prova de falha; a resolução acontece via `GET /{ref}`.
 * - O POST de emissão NÃO passa por retry automático (efeito colateral);
 *   somente leituras (consulta/download) usam retry com backoff.
 * - Cada transição grava `fiscal_document_events` e, quando terminal
 *   (AUTHORIZED/REJECTED/CANCELLED), publica evento de integração no outbox
 *   para o core-api atualizar `notas_fiscais`.
 */
@Service
public class FiscalService {

    private static final Logger log = LoggerFactory.getLogger(FiscalService.class);

    @ConfigurationProperties(prefix = "hweld.fiscal")
    public record Props(String provider, boolean autoEmitOnPaymentConfirmed, String ambiente,
            long reconcileMinAgeMs, int reconcileBatchSize) {
        public Props {
            if (provider == null || provider.isBlank()) provider = "stub";
            if (ambiente == null) ambiente = "homologacao";
            if (reconcileMinAgeMs <= 0) reconcileMinAgeMs = 60_000;
            if (reconcileBatchSize <= 0) reconcileBatchSize = 20;
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

    /**
     * Solicita emissão. Idempotente por (pedido, docType) — uma nova chamada
     * para pedido que já tem documento em andamento/autorizado retorna o
     * existente. `REQUIRES_RECONCILIATION` também bloqueia: a ref pode estar
     * no provedor; resolver antes de reemitir.
     */
    @Transactional
    public FiscalDocument requestEmission(long pedidoId, long empresaId, UUID billingInvoiceId,
            Long notaFiscalId, FiscalDocument.DocType docType, Map<String, Object> dados) {

        var existente = repository.findByPedidoId(pedidoId, Pageable.ofSize(10)).stream()
                .filter(d -> d.getDocType().equals(docType.name()))
                .filter(d -> List.of("REQUESTED", "PROCESSING", "AUTHORIZED",
                        "CANCELLATION_PENDING", "REQUIRES_RECONCILIATION").contains(d.getStatus()))
                .findFirst();
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

        // Persiste a referência ANTES do POST — crash/timeout depois do envio
        // reconcilia pela mesma ref (a UNIQUE provider+env+ref também bloqueia
        // emissão duplicada do mesmo documento).
        String ref = provider.providerRef(doc.getId().toString());
        doc.assignProviderRef(provider.environment(),
                ref != null ? ref : doc.getId().toString());
        repository.save(doc);

        Map<String, Object> dadosCompletos = new HashMap<>(dados != null ? dados : Map.of());
        if (notaFiscalId != null) dadosCompletos.put("nota_fiscal_id", notaFiscalId);

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
            // Falha desconhecida pós-envio: a ref pode existir no provedor —
            // reconciliação decide; nunca reenvio cego.
            log.error("fiscal: emissão inconclusiva doc {} pedido {}: {}",
                    doc.getId(), pedidoId, e.getMessage());
            doc.markReconciliation("desconhecido", truncar(e.getMessage()));
            repository.save(doc);
            recordEvent(doc, FiscalDocumentEvent.Type.ERROR, "REQUESTED",
                    "resultado inconclusivo: " + truncar(e.getMessage()), null);
        }
        return doc;
    }

    /**
     * Resolve o adapter de novas emissões. `provider=auto` (default) escolhe
     * o primeiro adapter com credenciais configuradas — Spedy gerenciada pelo
     * cliente, depois Focus (env), senão stub. Nome explícito força o adapter.
     */
    private FiscalProvider resolveProvider() {
        String wanted = props.provider() == null ? "auto" : props.provider().trim();
        if ("auto".equalsIgnoreCase(wanted)) {
            for (String nome : List.of("spedy", "focusnfe")) {
                FiscalProvider p = providers.get(nome);
                if (p != null && p.configured()) return p;
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
            // Timeout/transporte/429/5xx: o provedor pode ter recebido a ref.
            // Marca para reconciliação — a consulta por ref decide o destino.
            doc.markReconciliation(e.codigo(), truncar(e.primeiraMensagem()));
            repository.save(doc);
            recordEvent(doc, FiscalDocumentEvent.Type.ERROR, anterior,
                    "emissão inconclusiva (" + e.codigo() + "): "
                            + truncar(e.primeiraMensagem()), null);
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

    // ── Consulta / refresh / reconciliação ────────────────────────────────────

    /** Polling de status no provedor — leitura segura com retry + CB. */
    @Transactional
    public FiscalDocument refresh(UUID id) {
        FiscalDocument doc = get(id);
        sincronizar(doc, FiscalDocumentEvent.Type.RECONCILE, "refresh manual");
        return doc;
    }

    /**
     * Aplica o status remoto (webhook ou consulta) ao documento.
     * Retorna `true` quando o estado interno mudou — usado pelo dedupe do
     * webhook para registrar PROCESSED vs PROCESSED_NO_CHANGE.
     */
    @Transactional
    public boolean applyWebhookStatus(FiscalDocument doc, FiscalProvider.StatusResult remote) {
        if (doc.isTerminal() && remote.status().name().equals(doc.getStatus())) {
            return false;
        }
        if (doc.isTerminal()) {
            // Estado terminal protegido: webhook fora de ordem não reabre —
            // registra a divergência para reconciliação manual.
            recordEvent(doc, FiscalDocumentEvent.Type.WEBHOOK, doc.getStatus(),
                    "status remoto " + remote.status() + " ignorado — documento terminal",
                    Map.of("providerStatus", String.valueOf(remote.providerStatus())));
            return false;
        }
        String anterior = doc.getStatus();
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
     * Ciclo de reconciliação — documentos não-terminais antigos o bastante
     * para terem um webhook perdido ou emissão inconclusiva. Somente GET.
     */
    @Transactional
    public int reconcilePending() {
        var pendentes = repository.findTop50ByStatusInOrderByUpdatedAtAsc(List.of(
                "REQUESTED", "PROCESSING", "REQUIRES_RECONCILIATION", "CANCELLATION_PENDING"));
        Instant corte = Instant.now().minus(Duration.ofMillis(props.reconcileMinAgeMs()));
        int processados = 0;
        for (FiscalDocument doc : pendentes) {
            if (processados >= props.reconcileBatchSize()) break;
            if (doc.getUpdatedAt().isAfter(corte)) break; // ordenado por updated_at
            try {
                sincronizar(doc, FiscalDocumentEvent.Type.RECONCILE, "reconciliação agendada");
                processados++;
            } catch (Exception e) {
                log.warn("fiscal: reconciliação doc {} falhou: {}", doc.getId(), e.getMessage());
            }
        }
        return processados;
    }

    /** Consulta o provedor pela referência e aplica o estado remoto. */
    private void sincronizar(FiscalDocument doc, FiscalDocumentEvent.Type tipo, String origem) {
        FiscalProvider provider = providers.get(doc.getProvider());
        if (provider == null) {
            throw ApiException.validacao("provider desconhecido: " + doc.getProvider());
        }
        if (doc.getExternalId() == null) {
            // Sem ref o provedor nunca soube do documento — marca ERROR.
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
                // A ref não existe no provedor — o POST nunca chegou: falha
                // definitiva, seguro reenviar como nova emissão se desejado.
                String anterior = doc.getStatus();
                doc.applySync(FiscalDocument.Status.ERROR, e.codigo(),
                        "referência ausente no provedor — emissão não recebida",
                        null, null, null, null, null, null,
                        truncar(e.primeiraMensagem()), null);
                repository.save(doc);
                recordEvent(doc, tipo, anterior, "ref não encontrada (" + origem + ")", null);
                return;
            }
            throw e; // transitório — a próxima passagem tenta de novo
        }
        if (remote == null) return;
        boolean mudou = applyWebhookStatus(doc, remote);
        if (mudou) {
            audit.record("fiscal." + doc.getStatus().toLowerCase(), "fiscal_document",
                    doc.getId().toString(), Map.of("origem", origem));
        }
    }

    /** Download de artefatos quando o documento fica autorizado/cancelado. */
    private void baixarArtefatosSeAutorizado(FiscalDocument doc) {
        if (!FiscalDocument.Status.AUTHORIZED.name().equals(doc.getStatus())
                && !FiscalDocument.Status.CANCELLED.name().equals(doc.getStatus())) {
            return;
        }
        if (doc.getXmlUrl() != null && doc.getPdfUrl() != null) return; // já hospedados
        FiscalProvider provider = providers.get(doc.getProvider());
        if (provider == null || doc.getExternalId() == null) return;
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

    // ── Cancelamento / carta de correção / hooks ─────────────────────────────

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
            callProviderOnce(provider, () -> { provider.cancel(doc.getExternalId(), motivo); return null; });
        } catch (FiscalProviderException e) {
            if (e.inconclusivo() || e.retriable()) {
                // Permanece CANCELLATION_PENDING — reconciliação resolve.
                recordEvent(doc, FiscalDocumentEvent.Type.ERROR, null,
                        "cancelamento inconclusivo: " + truncar(e.primeiraMensagem()), null);
                return doc;
            }
            // Rejeição definitiva — volta ao estado autorizado.
            doc.applySync(FiscalDocument.Status.AUTHORIZED, e.codigo(), null,
                    null, null, null, null, null, null,
                    truncar(e.primeiraMensagem()), null);
            repository.save(doc);
            recordEvent(doc, FiscalDocumentEvent.Type.ERROR, "CANCELLATION_PENDING",
                    "cancelamento rejeitado: " + truncar(e.primeiraMensagem()), null);
            throw ApiException.validacao("cancelamento rejeitado: " + e.primeiraMensagem());
        }
        // Confirmado — aplica o estado terminal e publica o evento.
        doc.applySync(FiscalDocument.Status.CANCELLED, null, motivo,
                null, null, null, null, null, null, null, null);
        repository.save(doc);
        recordEvent(doc, FiscalDocumentEvent.Type.CANCEL, "CANCELLATION_PENDING",
                "cancelado — " + truncar(motivo), null);
        publicarSeTerminal(doc);
        audit.record("fiscal.cancelled", "fiscal_document", id.toString(), Map.of("motivo", motivo));
        return doc;
    }

    /** Carta de correção NF-e (15–1000 chars) — somente documento AUTHORIZED. */
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

    /** Pede ao provedor o reenvio das notificações (webhook) do documento. */
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

    // ── Leituras ─────────────────────────────────────────────────────────────

    /** Bytes do artefato hospedado (`xml`/`pdf`) — `null` quando ausente. */
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
        if (pedidoId != null) return repository.findByPedidoId(pedidoId, pageable);
        if (status != null) return repository.findByStatus(status.toUpperCase(), pageable);
        return repository.findAll(pageable);
    }

    @Transactional(readOnly = true)
    public List<FiscalDocumentEvent> historico(UUID id) {
        return events.findByFiscalDocumentIdOrderByCreatedAtAsc(id);
    }

    // ── Publicação / eventos internos ────────────────────────────────────────

    /** Publica o evento de integração terminal (uma vez — estado terminal protegido). */
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
        if (doc.getProviderStatus() != null) payload.put("providerStatus", doc.getProviderStatus());
        if (doc.getStatusDetail() != null) payload.put("statusDetail", doc.getStatusDetail());
        if (doc.getAccessKey() != null) payload.put("accessKey", doc.getAccessKey());
        if (doc.getProtocol() != null) payload.put("protocol", doc.getProtocol());
        if (doc.getNumero() != null) payload.put("numero", doc.getNumero());
        if (doc.getSerie() != null) payload.put("serie", doc.getSerie());
        if (doc.getXmlUrl() != null) payload.put("xmlUrl", doc.getXmlUrl());
        if (doc.getPdfUrl() != null) payload.put("pdfUrl", doc.getPdfUrl());
        if (doc.getRejectionReason() != null) payload.put("rejectionReason", doc.getRejectionReason());
        if (doc.getNotaFiscalId() != null) payload.put("notaFiscalId", doc.getNotaFiscalId());
        return payload;
    }

    private static String truncar(String s) {
        if (s == null) return null;
        return s.length() <= 400 ? s : s.substring(0, 400);
    }

    private interface ProviderCall<T> { T run(); }

    /**
     * Chamada com efeito colateral (emissão/cancelamento) — SEM retry: timeout
     * não é prova de falha e reenvio cego duplicaria o documento no provedor.
     */
    private <T> T callProviderOnce(FiscalProvider provider, ProviderCall<T> call) {
        return call.run();
    }

    /** Leitura idempotente — retry com backoff + circuit breaker. */
    private <T> T callProviderRead(FiscalProvider provider, ProviderCall<T> call) {
        Retry retry = HttpClientsConfig.retry("fiscal-" + provider.name(), 3);
        CircuitBreaker cb = HttpClientsConfig.circuitBreaker("fiscal-" + provider.name());
        return Retry.decorateSupplier(retry, CircuitBreaker.decorateSupplier(cb, call::run)).get();
    }
}

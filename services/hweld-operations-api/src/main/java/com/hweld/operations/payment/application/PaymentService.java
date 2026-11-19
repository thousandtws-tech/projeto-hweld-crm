package com.hweld.operations.payment.application;

import com.hweld.operations.payment.domain.Payment;
import com.hweld.operations.payment.domain.PaymentMethod;
import com.hweld.operations.payment.domain.PaymentRepository;
import com.hweld.operations.payment.domain.PaymentStatus;
import com.hweld.operations.payment.domain.PaymentTransaction;
import com.hweld.operations.payment.domain.PaymentTransactionRepository;
import com.hweld.operations.shared.application.EventTypes;
import com.hweld.operations.shared.application.IntegrationEvent;
import com.hweld.operations.shared.domain.Money;
import com.hweld.operations.shared.infrastructure.audit.AuditService;
import com.hweld.operations.shared.infrastructure.coreapi.OrderGateway;
import com.hweld.operations.shared.infrastructure.coreapi.OrderGateway.OrderInfo;
import com.hweld.operations.shared.infrastructure.outbox.Outbox;
import com.hweld.operations.shared.infrastructure.security.AuthPrincipal;
import com.hweld.operations.shared.interfaces.error.ApiException;
import com.hweld.operations.shared.interfaces.web.CorrelationIdFilter;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.retry.Retry;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Casos de uso do módulo Payment: criação de cobrança no PSP (idempotente),
 * cancelamento, estorno, reconciliação e aplicação de webhooks.
 * Dinheiro sempre vem do pedido no core-api — o cliente nunca envia valor.
 */
@Service
public class PaymentService {

    private static final Logger log = LoggerFactory.getLogger(PaymentService.class);

    private final PaymentRepository payments;
    private final PaymentTransactionRepository transactions;
    private final ProviderRegistry providers;
    private final OrderGateway orderGateway;
    private final Outbox outbox;
    private final AuditService audit;
    private final PaymentProperties props;

    public PaymentService(PaymentRepository payments, PaymentTransactionRepository transactions,
            ProviderRegistry providers, OrderGateway orderGateway, Outbox outbox,
            AuditService audit, PaymentProperties props) {
        this.payments = payments;
        this.transactions = transactions;
        this.providers = providers;
        this.orderGateway = orderGateway;
        this.outbox = outbox;
        this.audit = audit;
        this.props = props;
    }

    public record CreatePaymentCommand(
            long pedidoId,
            PaymentMethod method,
            String provider,
            String idempotencyKey,
            String emailContato,
            String cardToken,
            Integer installments,
            String paymentMethodId,
            String issuerId,
            String identificationType,
            String identificationNumber) {}

    /**
     * Cria cobrança para o pedido. A posse/visibilidade é validada repassando
     * o JWT do chamador ao core-api; o valor é sempre `pedido.total`.
     */
    @Transactional
    public Payment create(CreatePaymentCommand cmd, AuthPrincipal actor, String callerJwt) {
        boolean portalCtx = actor.isPortal();
        OrderInfo order = orderGateway.getOrder(cmd.pedidoId(), callerJwt, portalCtx);

        if ("cancelado".equals(order.status()) || "concluido".equals(order.status())) {
            throw ApiException.conflito("pedido " + cmd.pedidoId() + " não aceita cobrança (status=" + order.status() + ")");
        }
        if (portalCtx && order.contatoId() != null && order.contatoId() != actor.id()) {
            // Pedido é da empresa mas de outro contato — cobrança permitida (B2B
            // paga pela empresa), mas registramos o contato do pedido.
        }

        // Portal não escolhe provider: o campo no DTO existiria para o painel
        // testar PSPs — aceitá-lo do portal desviaria do kill-switch do
        // admin e permitiria forçar o stub.
        if (actor.isPortal() && cmd.provider() != null) {
            throw ApiException.validacao("provider de pagamento indisponível");
        }
        PaymentProvider provider = cmd.provider() != null
                ? providers.get(cmd.provider()) : providers.defaultProvider();
        if ("stub".equals(provider.name()) && actor.isPortal()) {
            // Stub é provider de teste — se ele cair como default (nenhum PSP
            // credenciado), o portal não pode cobrar por ele.
            throw ApiException.validacao("provider de pagamento indisponível");
        }
        if (cmd.provider() != null && !provider.configured() && !"stub".equals(provider.name())) {
            throw ApiException.validacao("provider " + provider.name() + " não está configurado");
        }

        // Guarda anti-dupla-cobrança: pedido com cobrança CONFIRMED não aceita
        // nova emissão — nem por chave nova, outro método ou outro provider.
        if (payments.existsByPedidoIdAndStatus(cmd.pedidoId(), PaymentStatus.CONFIRMED)) {
            throw ApiException.conflito("pedido " + cmd.pedidoId() + " já possui cobrança confirmada");
        }

        String idemKey = cmd.idempotencyKey() != null && !cmd.idempotencyKey().isBlank()
                ? cmd.idempotencyKey()
                : "pedido-" + cmd.pedidoId() + "-" + cmd.method() + "-" + provider.name();

        var existente = payments.findByIdempotencyKey(idemKey);
        if (existente.isPresent()) {
            if (existente.get().getEmpresaId() != order.empresaId()) {
                // A chave é campo do cliente — sem escopo de empresa ela
                // vazaria checkoutUrl/pix de pedido alheio (IDOR).
                throw ApiException.proibido("cobrança de outra empresa");
            }
            // Segue a cadeia de retentativas (base, -r2, -r3…) até a cobrança
            // mais recente — retentativa idempotente reutiliza a viva.
            Payment p = existente.get();
            int tentativa = 2;
            for (var prox = payments.findByIdempotencyKey(idemKey + "-r" + tentativa);
                    prox.isPresent();
                    prox = payments.findByIdempotencyKey(idemKey + "-r" + ++tentativa)) {
                p = prox.get();
            }
            if (!p.getStatus().isTerminal()) {
                if (p.getExpiresAt() != null && p.getExpiresAt().isBefore(Instant.now())) {
                    // Viva localmente mas morta no PSP (preferência/QR
                    // expirado) — marca e reemite em vez de devolver link
                    // quebrado para sempre.
                    p.transitionTo(PaymentStatus.EXPIRED, "expirada",
                            "cobrança expirada sem pagamento");
                    payments.save(p);
                } else {
                    return p;
                }
            }
            // Última da cadeia terminal — inativa o link/cobrança morta no
            // PSP (senão o cliente paga o link velho E o novo = cobrança
            // dupla) e reemite com a próxima chave livre.
            inativarCobrancaMorta(provider, p);
            idemKey = idemKey + "-r" + tentativa;
        }

        java.util.Map<String, Object> meta = new java.util.HashMap<>(Map.of(
                "pedidoId", cmd.pedidoId(), "pedidoNumero", order.numero(),
                "empresaId", order.empresaId(),
                "contatoTelefone", order.contatoTelefone() != null ? order.contatoTelefone() : ""));
        // Checkout transparente: campos tokenizados passam pela metadata —
        // o provider MP os consome; outros PSPs ignoram (fluxo hospedado).
        if (cmd.cardToken() != null && !cmd.cardToken().isBlank()) {
            meta.put("cardToken", cmd.cardToken().trim());
            meta.put("installments", cmd.installments() != null ? cmd.installments() : 1);
            meta.put("paymentMethodId", cmd.paymentMethodId() != null ? cmd.paymentMethodId() : "");
            meta.put("issuerId", cmd.issuerId() != null ? cmd.issuerId() : "");
            meta.put("identificationType", cmd.identificationType() != null ? cmd.identificationType() : "");
            meta.put("identificationNumber", cmd.identificationNumber() != null ? cmd.identificationNumber() : "");
        }
        PaymentProvider.ChargeRequest chargeReq = new PaymentProvider.ChargeRequest(
                idemKey, order.total(), cmd.method(),
                "Pedido " + order.numero(), order.contatoEmail() != null ? order.contatoEmail() : cmd.emailContato(),
                meta);

        PaymentProvider.ChargeResult charge;
        try {
            charge = callProvider(provider, () -> provider.createCharge(chargeReq));
        } catch (ApiException e) {
            throw e; // erro de domínio do provider (ex.: método não suportado) — não vira 502
        } catch (Exception e) {
            log.error("psp {} falhou ao criar cobrança (pedido {}): {}", provider.name(), cmd.pedidoId(), e.getMessage());
            throw ApiException.provedorIndisponivel("provedor de pagamento indisponível");
        }

        Payment payment = new Payment(UUID.randomUUID(), cmd.pedidoId(), order.empresaId(),
                order.contatoId(), provider.name(), cmd.method(), order.total().amount(),
                idemKey, actor.tipo(), String.valueOf(actor.id()));
        payment.assignPedidoNumero(order.numero());
        payment.assignContatoEmail(order.contatoEmail() != null ? order.contatoEmail() : cmd.emailContato());
        payment.assignContatoTelefone(order.contatoTelefone());
        payment.applyProviderResult(charge.externalId(), charge.checkoutUrl(),
                charge.pixQrCode(), charge.pixCopyPaste(), charge.expiresAt());
        if (charge.status() != PaymentStatus.PENDING && payment.getStatus().canTransitionTo(charge.status())) {
            payment.transitionTo(charge.status(), charge.failureCode(), charge.failureMessage());
        }

        try {
            payments.saveAndFlush(payment);
        } catch (DataIntegrityViolationException e) {
            // Corrida de idempotência: a TX está morta após o flush falho e a
            // cobrança criada no PSP ficaria órfã/pagável — inativa best-effort
            // e pede repetição (a chamada seguinte devolve a linha vencedora).
            inativarCobrancaMorta(provider, charge, null);
            throw ApiException.conflito("cobrança em criação concorrente — repita a chamada");
        }

        transactions.save(new PaymentTransaction(payment.getId(),
                PaymentTransaction.Type.CHARGE_CREATED, null, payment.getStatus().name(),
                payment.getAmount(), payment.getCurrency(), charge.externalId(), charge.raw()));

        outbox.publish("payment", payment.getId().toString(), IntegrationEvent.of(
                EventTypes.PAYMENT_REQUESTED, payment.getId().toString(),
                eventPayload(payment, order), CorrelationIdFilter.current()));

        audit.record("payment.created", "payment", payment.getId().toString(), Map.of(
                "pedidoId", cmd.pedidoId(), "method", cmd.method().name(),
                "provider", provider.name(), "amount", payment.getAmount().toPlainString()));
        return payment;
    }

    @Transactional(readOnly = true)
    public Payment get(UUID id, AuthPrincipal actor, String callerJwt) {
        Payment p = payments.findById(id)
                .orElseThrow(() -> ApiException.naoEncontrado("pagamento não encontrado"));
        checkOwnership(p, actor, callerJwt);
        return p;
    }

    @Transactional(readOnly = true)
    public Page<Payment> list(Long pedidoId, PaymentStatus status, AuthPrincipal actor,
            String callerJwt, Pageable pageable) {
        if (actor.isPortal()) {
            var perfil = orderGateway.getPortalProfile(callerJwt);
            if (pedidoId != null) {
                // Portal filtrado por empresa — pedidoId de terceiro devolve página vazia.
                return payments.findByEmpresaIdAndPedidoId(perfil.empresaId(), pedidoId, pageable);
            }
            if (status != null) {
                return payments.findByEmpresaIdAndStatus(perfil.empresaId(), status, pageable);
            }
            return payments.findByEmpresaId(perfil.empresaId(), pageable);
        }
        if (pedidoId != null) return payments.findByPedidoId(pedidoId, pageable);
        if (status != null) return payments.findByStatus(status, pageable);
        return payments.findAll(pageable);
    }

    @Transactional
    public Payment cancel(UUID id, AuthPrincipal actor, String callerJwt) {
        Payment p = get(id, actor, callerJwt);
        // Valida ANTES de tocar o PSP: cancelar uma cobrança CONFIRMED no
        // PagBank executa ESTORNO — sem o guard, a transição local falhava
        // depois do dinheiro devolvido (estorno silencioso + reembolso duplo).
        if (!p.getStatus().canTransitionTo(PaymentStatus.CANCELLED)) {
            throw ApiException.conflito("não é possível cancelar cobrança "
                    + p.getStatus() + " — use estorno para CONFIRMED");
        }
        PaymentProvider provider = providers.get(p.getProvider());
        if (p.getExternalId() != null) {
            callProvider(provider, () -> { provider.cancelCharge(p.getExternalId()); return null; });
        }
        transitionAndPublish(p, PaymentStatus.CANCELLED, null, null, PaymentTransaction.Type.CANCEL);
        return p;
    }

    @Transactional
    public Payment refund(UUID id, AuthPrincipal actor, String callerJwt) {
        Payment p = get(id, actor, callerJwt);
        if (p.getStatus() != PaymentStatus.CONFIRMED) {
            throw ApiException.conflito("só é possível estornar pagamento CONFIRMED (atual=" + p.getStatus() + ")");
        }
        PaymentProvider provider = providers.get(p.getProvider());
        Money amount = new Money(p.getAmount(), p.getCurrency());
        callProvider(provider, () -> { provider.refundCharge(p.getExternalId(), amount); return null; });
        transitionAndPublish(p, PaymentStatus.REFUNDED, null, null, PaymentTransaction.Type.REFUND);
        return p;
    }

    /** Reconciliação: consulta o PSP e alinha o estado local se divergir. */
    @Transactional
    public Payment reconcile(UUID id) {
        Payment p = payments.findById(id)
                .orElseThrow(() -> ApiException.naoEncontrado("pagamento não encontrado"));
        PaymentProvider provider = providers.get(p.getProvider());
        PaymentProvider.ChargeResult remote = callProvider(provider, () -> provider.getCharge(p.getExternalId()));
        if (remote != null && remote.status() != p.getStatus() && p.getStatus().canTransitionTo(remote.status())) {
            transitionAndPublish(p, remote.status(), remote.status() == PaymentStatus.FAILED ? "provider" : null,
                    null, PaymentTransaction.Type.RECONCILE);
        }
        return p;
    }

    /**
     * Aplica o resultado de um webhook já validado/deduplicado. Chamado pelo
     * WebhookService dentro da mesma transação.
     */
    @Transactional
    public void applyWebhookResult(Payment payment, PaymentProvider.ParsedWebhook parsed) {
        if (payment.getStatus() == parsed.status()) {
            return; // já estamos no estado — webhook redundante, mas válido
        }
        if (!payment.getStatus().canTransitionTo(parsed.status())) {
            log.warn("webhook ignorado: {} → {} inválido para payment {}",
                    payment.getStatus(), parsed.status(), payment.getId());
            return;
        }
        // Relink só em transição ACEITA: checkout hospedado migra o id do
        // link (CHEC_*) para a cobrança real (CHAR_*) — um webhook tardio de
        // tentativa recusada não pode repontar cancel/refund à cobrança morta.
        payment.relinkExternalId(parsed.externalPaymentId());
        transitionAndPublish(payment, parsed.status(), parsed.failureCode(),
                parsed.failureMessage(), PaymentTransaction.Type.WEBHOOK);
    }

    @Transactional(readOnly = true)
    public java.util.Optional<Payment> findByProviderExternalId(String provider, String externalId) {
        return payments.findByProviderAndExternalId(provider, externalId);
    }

    @Transactional(readOnly = true)
    public List<PaymentTransaction> transactionsOf(UUID paymentId, AuthPrincipal actor, String callerJwt) {
        Payment p = get(paymentId, actor, callerJwt);
        return transactions.findByPaymentIdOrderByOccurredAt(p.getId());
    }

    // ── internos ────────────────────────────────────────────────────────────

    private void checkOwnership(Payment p, AuthPrincipal actor, String callerJwt) {
        if (actor.isPortal()) {
            var perfil = orderGateway.getPortalProfile(callerJwt);
            if (perfil.empresaId() != p.getEmpresaId()) {
                throw ApiException.proibido("pagamento de outra empresa");
            }
        }
        // staff/service: RBAC já aplicado na camada web
    }

    private void transitionAndPublish(Payment p, PaymentStatus next, String failureCode,
            String failureMessage, PaymentTransaction.Type txType) {
        PaymentStatus from = p.getStatus();
        p.transitionTo(next, failureCode, failureMessage);
        payments.save(p);
        transactions.save(new PaymentTransaction(p.getId(), txType,
                from.name(), next.name(), p.getAmount(), p.getCurrency(),
                p.getExternalId(), Map.of("failureCode", failureCode != null ? failureCode : "")));

        String eventType = switch (next) {
            case CONFIRMED -> EventTypes.PAYMENT_CONFIRMED;
            case FAILED -> EventTypes.PAYMENT_FAILED;
            case CANCELLED -> EventTypes.PAYMENT_CANCELLED;
            case EXPIRED -> EventTypes.PAYMENT_EXPIRED;
            case REFUNDED -> EventTypes.REFUND_COMPLETED;
            default -> null;
        };
        if (eventType != null) {
            Map<String, Object> payload = new HashMap<>(Map.of(
                    "paymentId", p.getId().toString(),
                    "pedidoId", p.getPedidoId(),
                    "empresaId", p.getEmpresaId(),
                    "amount", p.getAmount().toPlainString(),
                    "currency", p.getCurrency(),
                    "method", p.getMethod().name(),
                    "provider", p.getProvider()));
            if (p.getContatoId() != null) payload.put("contatoId", p.getContatoId());
            if (p.getContatoEmail() != null) payload.put("contatoEmail", p.getContatoEmail());
            if (p.getContatoTelefone() != null) payload.put("contatoTelefone", p.getContatoTelefone());
            // Templates de notificação interpolam {{pedidoNumero}} — sem ele o
            // e-mail sai com "pedido ," em branco. Rows antigas (pré-coluna)
            // caem no fallback com o id numérico.
            payload.put("pedidoNumero", p.getPedidoNumero() != null
                    ? p.getPedidoNumero() : String.valueOf(p.getPedidoId()));
            if (failureCode != null) payload.put("failureCode", failureCode);
            outbox.publish("payment", p.getId().toString(),
                    IntegrationEvent.of(eventType, p.getId().toString(), payload, CorrelationIdFilter.current()));
        }
        audit.record("payment." + next.name().toLowerCase(), "payment", p.getId().toString(),
                Map.of("from", from.name(), "pedidoId", p.getPedidoId()));
    }

    private static Map<String, Object> eventPayload(Payment p, OrderInfo order) {
        Map<String, Object> payload = new HashMap<>(Map.of(
                "paymentId", p.getId().toString(),
                "pedidoId", p.getPedidoId(),
                "pedidoNumero", order.numero(),
                "empresaId", p.getEmpresaId(),
                "amount", p.getAmount().toPlainString(),
                "currency", p.getCurrency(),
                "method", p.getMethod().name(),
                "provider", p.getProvider()));
        if (p.getContatoId() != null) payload.put("contatoId", p.getContatoId());
        if (order.contatoEmail() != null) payload.put("contatoEmail", order.contatoEmail());
        if (order.contatoTelefone() != null) payload.put("contatoTelefone", order.contatoTelefone());
        if (p.getPixCopyPaste() != null) payload.put("pixCopyPaste", p.getPixCopyPaste());
        if (p.getCheckoutUrl() != null) payload.put("checkoutUrl", p.getCheckoutUrl());
        if (p.getExpiresAt() != null) payload.put("expiresAt", p.getExpiresAt().toString());
        return payload;
    }

    /** Inativa best-effort uma cobrança morta/órfã no PSP — link antigo não
     * pode continuar pagável após reemissão ou corrida de idempotência. */
    private void inativarCobrancaMorta(PaymentProvider provider, Payment morta) {
        inativarCobrancaMorta(provider, null, morta.getExternalId());
    }

    private void inativarCobrancaMorta(PaymentProvider provider,
            PaymentProvider.ChargeResult charge, String externalId) {
        String id = externalId != null ? externalId : charge != null ? charge.externalId() : null;
        if (id == null) return;
        try {
            provider.cancelCharge(id);
        } catch (Exception e) {
            log.warn("não consegui inativar cobrança anterior {} no {}: {}",
                    id, provider.name(), e.getMessage());
        }
    }

    private interface ProviderCall<T> { T run(); }

    private <T> T callProvider(PaymentProvider provider, ProviderCall<T> call) {
        // retryOnException: exceções com retryable()==false (INCONCLUSIVE =
        // a escrita pode ter chegado no PSP — reenviar duplica cobrança) e
        // erros de domínio (ApiException) NUNCA são retentadas.
        Retry retry = Retry.of("psp-" + provider.name(), io.github.resilience4j.retry.RetryConfig.custom()
                .maxAttempts(3)
                .intervalFunction(io.github.resilience4j.core.IntervalFunction
                        .ofExponentialRandomBackoff(java.time.Duration.ofMillis(500), 2.0))
                .retryOnException(PaymentService::retentavel)
                .build());
        CircuitBreaker cb = com.hweld.operations.shared.infrastructure.http.HttpClientsConfig
                .circuitBreaker("psp-" + provider.name());
        return Retry.decorateSupplier(retry,
                CircuitBreaker.decorateSupplier(cb, call::run)).get();
    }

    private static boolean retentavel(Throwable e) {
        if (e instanceof ApiException) return false;
        if (e instanceof com.hweld.operations.payment.infrastructure.pagbank.PagBankException pe) {
            return pe.retryable();
        }
        if (e instanceof com.hweld.operations.payment.infrastructure.mercadopago.MercadoPagoException me) {
            return me.retryable();
        }
        return true;
    }
}

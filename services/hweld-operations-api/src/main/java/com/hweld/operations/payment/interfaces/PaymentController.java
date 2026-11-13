package com.hweld.operations.payment.interfaces;

import com.hweld.operations.payment.application.PaymentService;
import com.hweld.operations.payment.domain.PaymentMethod;
import com.hweld.operations.payment.domain.PaymentStatus;
import com.hweld.operations.payment.interfaces.PaymentDtos.CreatePaymentRequest;
import com.hweld.operations.payment.interfaces.PaymentDtos.PaymentResponse;
import com.hweld.operations.shared.infrastructure.security.AuthPrincipal;
import com.hweld.operations.shared.interfaces.error.ApiException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/payments")
@Tag(name = "Payments", description = "Cobranças junto a PSPs (PIX, cartão via checkout, boleto)")
@SecurityRequirement(name = "bearerAuth")
public class PaymentController {

    private final PaymentService service;

    public PaymentController(PaymentService service) {
        this.service = service;
    }

    @PostMapping
    @Operation(summary = "Cria cobrança para um pedido (idempotente por Idempotency-Key)")
    public ResponseEntity<PaymentResponse> create(@Valid @RequestBody CreatePaymentRequest req,
            Authentication auth) {
        AuthPrincipal actor = AuthPrincipal.from(auth);
        PaymentResponse resp = PaymentResponse.from(service.create(
                new PaymentService.CreatePaymentCommand(req.pedidoId(), req.method(),
                        req.provider(), req.idempotencyKey(), req.emailContato()),
                actor, bearer(auth)));
        return ResponseEntity.status(HttpStatus.CREATED).body(resp);
    }

    @GetMapping("/{id}")
    public PaymentResponse get(@PathVariable UUID id, Authentication auth) {
        return PaymentResponse.from(service.get(id, AuthPrincipal.from(auth), bearer(auth)));
    }

    @GetMapping
    public Page<PaymentResponse> list(
            @RequestParam(required = false) Long pedidoId,
            @RequestParam(required = false) PaymentStatus status,
            @RequestParam(defaultValue = "0") int pagina,
            @RequestParam(defaultValue = "20") int porPagina,
            Authentication auth) {
        int size = Math.min(Math.max(porPagina, 1), 100);
        return service.list(pedidoId, status, AuthPrincipal.from(auth), bearer(auth),
                PageRequest.of(Math.max(pagina, 0), size, Sort.by(Sort.Direction.DESC, "createdAt")))
                .map(PaymentResponse::from);
    }

    @GetMapping("/{id}/transactions")
    public Object transactions(@PathVariable UUID id, Authentication auth) {
        return service.transactionsOf(id, AuthPrincipal.from(auth), bearer(auth));
    }

    @PostMapping("/{id}/cancel")
    public PaymentResponse cancel(@PathVariable UUID id, Authentication auth) {
        return PaymentResponse.from(service.cancel(id, AuthPrincipal.from(auth), bearer(auth)));
    }

    @PostMapping("/{id}/refund")
    public PaymentResponse refund(@PathVariable UUID id, Authentication auth) {
        return PaymentResponse.from(service.refund(id, AuthPrincipal.from(auth), bearer(auth)));
    }

    @PostMapping("/{id}/reconcile")
    public PaymentResponse reconcile(@PathVariable UUID id) {
        return PaymentResponse.from(service.reconcile(id));
    }

    private static String bearer(Authentication auth) {
        if (auth instanceof JwtAuthenticationToken jwt) {
            return jwt.getToken().getTokenValue();
        }
        throw ApiException.proibido("contexto de autenticação não suportado");
    }
}

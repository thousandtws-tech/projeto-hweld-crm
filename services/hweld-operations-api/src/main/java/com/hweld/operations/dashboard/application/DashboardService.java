package com.hweld.operations.dashboard.application;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Agregações do painel operacional — `GROUP BY status` genérico (robusto a
 * novos status sem mudar o DTO) + somas monetárias. Consultas leves sobre
 * projeções/tabelas próprias: nenhum callback ao core-api.
 */
@Service
public class DashboardService {

    @PersistenceContext
    private EntityManager em;

    public record Fatia(String status, long total, BigDecimal soma) {}
    public record Resumo(
            Instant geradoEm,
            Map<String, Object> pedidos,
            Map<String, Object> pagamentos,
            Map<String, Object> billing,
            Map<String, Object> fiscal,
            Map<String, Object> notificacoes) {}

    @Transactional(readOnly = true)
    public Resumo resumo() {
        return new Resumo(
                Instant.now(),
                bloco("OrderProjection", "total", null),
                bloco("Payment", "amount", "CONFIRMED"),
                bloco("BillingInvoice", "amount", "OPEN"),
                bloco("FiscalDocument", null, null),
                bloco("NotificationDelivery", null, null));
    }

    /**
     * `select status, count, sum(campo?) from Entidade group by status`.
     * `campoSoma` nulo → só contagens; `statusSoma` restringe a soma
     * exibida em `somaDestaque` (ex.: volume CONFIRMED de pagamentos).
     */
    private Map<String, Object> bloco(String entidade, String campoSoma, String statusSoma) {
        String sum = campoSoma != null ? ", coalesce(sum(e." + campoSoma + "),0)" : ", 0";
        @SuppressWarnings("unchecked")
        List<Object[]> linhas = em.createQuery(
                "select e.status, count(e)" + sum + " from " + entidade + " e group by e.status")
                .getResultList();

        Map<String, Object> porStatus = new LinkedHashMap<>();
        BigDecimal somaDestaque = BigDecimal.ZERO;
        long total = 0;
        for (Object[] l : linhas) {
            String status = String.valueOf(l[0]);
            long n = ((Number) l[1]).longValue();
            BigDecimal soma = l[2] instanceof BigDecimal b ? b : new BigDecimal(String.valueOf(l[2]));
            porStatus.put(status, campoSoma != null ? Map.of("quantidade", n, "valor", soma) : n);
            total += n;
            if (statusSoma != null && statusSoma.equals(status)) {
                somaDestaque = soma;
            }
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("total", total);
        out.put("porStatus", porStatus);
        if (statusSoma != null) {
            out.put("somaDestaque", somaDestaque);
        }
        return out;
    }
}

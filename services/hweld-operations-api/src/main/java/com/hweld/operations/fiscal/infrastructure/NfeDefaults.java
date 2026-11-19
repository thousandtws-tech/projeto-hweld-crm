package com.hweld.operations.fiscal.infrastructure;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Defaults fiscais aplicados aos itens/nota quando ausentes no
 * cadastro/pedido — compartilhados por todos os adapters `FiscalProvider`.
 * Prefixo: `hweld.fiscal.nfe` (env `FISCAL_NFE_*`).
 */
@ConfigurationProperties(prefix = "hweld.fiscal.nfe")
public record NfeDefaults(
        String naturezaOperacao,
        String cfop,
        String unidade,
        Integer tipoDocumento,
        Integer finalidadeEmissao,
        Integer modalidadeFrete,
        Integer presencaComprador,
        Boolean consumidorFinal,
        Integer indicadorIeDestinatario,
        String icmsSituacaoTributaria,
        String pisSituacaoTributaria,
        String cofinsSituacaoTributaria,
        Integer icmsOrigem) {
}

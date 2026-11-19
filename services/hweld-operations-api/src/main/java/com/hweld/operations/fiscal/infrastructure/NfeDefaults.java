package com.hweld.operations.fiscal.infrastructure;

import org.springframework.boot.context.properties.ConfigurationProperties;

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

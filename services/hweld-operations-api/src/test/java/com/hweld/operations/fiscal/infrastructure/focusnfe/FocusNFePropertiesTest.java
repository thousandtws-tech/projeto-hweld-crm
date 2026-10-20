package com.hweld.operations.fiscal.infrastructure.focusnfe;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class FocusNFePropertiesTest {

    private static FocusNFeProperties props(String environment, String homToken,
            String prodToken, boolean prodEnabled) {
        return new FocusNFeProperties(environment, null, null, homToken, prodToken,
                prodEnabled, 30_000, 15_000, null, null, null, null, null);
    }

    @Test
    void ambientePadraoHomologacao() {
        var p = props(null, "tok-hom", null, false);
        assertThat(p.environment()).isEqualTo("homologacao");
        assertThat(p.baseUrl()).isEqualTo("https://homologacao.focusnfe.com.br");
        assertThat(p.producao()).isFalse();
    }

    @Test
    void ambienteInvalidoFalhaNaConstrucao() {
        assertThatThrownBy(() -> props("staging", "t", null, false))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("environment inválido");
    }

    @Test
    void tokenHomologacaoSemFallbackParaProducao() {
        var p = props("homologacao", "  tok-hom  ", "tok-prod", false);
        // mesmo havendo token de produção, homologação usa o próprio
        assertThat(p.token()).isEqualTo("tok-hom");
        assertThat(p.baseUrl()).isEqualTo("https://homologacao.focusnfe.com.br");
    }

    @Test
    void tokenAusenteNoAmbienteAtivoFalhaFast() {
        var p = props("homologacao", null, "tok-prod", false);
        assertThatThrownBy(p::token)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("FOCUS_NFE_HOMOLOGATION_TOKEN");
    }

    @Test
    void producaoSemHabilitacaoExplicitaBloqueiaEmissao() {
        var p = props("producao", "tok-hom", "tok-prod", false);
        assertThatThrownBy(p::token)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("FOCUS_NFE_PRODUCTION_ENABLED");
    }

    @Test
    void producaoHabilitadaComTokenResolve() {
        var p = props("producao", "tok-hom", "tok-prod", true);
        assertThat(p.token()).isEqualTo("tok-prod");
        assertThat(p.baseUrl()).isEqualTo("https://api.focusnfe.com.br");
        assertThat(p.producao()).isTrue();
    }

    @Test
    void producaoHabilitadaSemTokenFalha() {
        var p = props("producao", "tok-hom", null, true);
        assertThatThrownBy(p::token)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("FOCUS_NFE_PRODUCTION_TOKEN");
    }
}

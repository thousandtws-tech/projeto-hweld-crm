package com.hweld.operations.notification;

import static org.assertj.core.api.Assertions.assertThat;

import com.hweld.operations.notification.application.PhoneNormalizer;
import com.hweld.operations.notification.application.SmsSegmenter;
import org.junit.jupiter.api.Test;

/** Normalização E.164 e segmentação GSM-7/UCS-2. */
class SmsUnitTest {

    @Test
    void normalizaBrasilLocal() {
        assertThat(PhoneNormalizer.toE164("(41) 99988-7766")).isEqualTo("+5541999887766");
        assertThat(PhoneNormalizer.toE164("41 3333-4455")).isEqualTo("+554133334455");
        assertThat(PhoneNormalizer.toE164("5541999887766")).isEqualTo("+5541999887766");
        assertThat(PhoneNormalizer.toE164("+55 41 99988-7766")).isEqualTo("+5541999887766");
    }

    @Test
    void normalizaInternacionalEInvalidos() {
        assertThat(PhoneNormalizer.toE164("+1 415 555 0132")).isEqualTo("+14155550132");
        assertThat(PhoneNormalizer.toE164("+351912345678")).isEqualTo("+351912345678");
        assertThat(PhoneNormalizer.toE164("123")).isNull();
        assertThat(PhoneNormalizer.toE164("")).isNull();
        assertThat(PhoneNormalizer.toE164(null)).isNull();
        assertThat(PhoneNormalizer.toE164("abcdefghij")).isNull();
    }

    @Test
    void gsm7BasicoUmSegmento() {
        var c = SmsSegmenter.count("HWeld: pedido PV-123 confirmado.");
        assertThat(c.encoding()).isEqualTo(SmsSegmenter.Encoding.GSM7);
        assertThat(c.segments()).isEqualTo(1);
    }

    @Test
    void gsm7Limite160EConcatenado() {
        String exato = "a".repeat(160);
        assertThat(SmsSegmenter.count(exato).segments()).isEqualTo(1);
        // 161 unidades → 2 segmentos de 153
        assertThat(SmsSegmenter.count("a".repeat(161)).segments()).isEqualTo(2);
        assertThat(SmsSegmenter.count("a".repeat(306)).segments()).isEqualTo(2);
        assertThat(SmsSegmenter.count("a".repeat(307)).segments()).isEqualTo(3);
    }

    @Test
    void gsm7EstendidoContaDuplo() {
        // '€' é da tabela estendida — conta 2 unidades
        assertThat(SmsSegmenter.count("Preço: 100€ total").encoding())
                .isEqualTo(SmsSegmenter.Encoding.GSM7);
        String comEuro = "a".repeat(159) + "€"; // 159 + 2 = 161 unidades
        assertThat(SmsSegmenter.count(comEuro).segments()).isEqualTo(2);
    }

    @Test
    void ucs2DeteccaoESegmentos() {
        var c = SmsSegmenter.count("Pedido — obrigado!"); // '—' fora do GSM-7
        assertThat(c.encoding()).isEqualTo(SmsSegmenter.Encoding.UCS2);
        assertThat(c.segments()).isEqualTo(1);
        // 71 chars UCS-2 → 2 segmentos de 67
        String longo = "あ".repeat(71);
        assertThat(SmsSegmenter.count(longo).segments()).isEqualTo(2);
        // acentos do alfabeto GSM-7 (é, à, Ç) NÃO forçam UCS-2
        assertThat(SmsSegmenter.count("Café pago à vista").encoding())
                .isEqualTo(SmsSegmenter.Encoding.GSM7);
        // 'ç' é GSM-7, mas 'ã' não — texto comum em pt-BR vira UCS-2
        assertThat(SmsSegmenter.count("Atenção à cobrança").encoding())
                .isEqualTo(SmsSegmenter.Encoding.UCS2);
    }
}

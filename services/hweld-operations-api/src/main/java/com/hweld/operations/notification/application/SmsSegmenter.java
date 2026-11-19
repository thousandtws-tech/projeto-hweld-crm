package com.hweld.operations.notification.application;

/**
 * Contagem de segmentos SMS — GSM-7 (160/153 por segmento) ou UCS-2 (70/67)
 * conforme o alfabeto do texto. GSM-7 estendido conta 2 unidades.
 */
public final class SmsSegmenter {

    public enum Encoding { GSM7, UCS2 }

    /** @param units unidades de codificação (7bit ou 16bit), já com extensões. */
    public record Count(Encoding encoding, int units, int segments) {
        public static final int SINGLE_GSM7 = 160;
        public static final int CONCAT_GSM7 = 153;
        public static final int SINGLE_UCS2 = 70;
        public static final int CONCAT_UCS2 = 67;
    }

    private static final String GSM7_BASIC =
            "@£$¥èéùìòçÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\u001BÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?"
            + "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

    private static final String GSM7_EXT = "^{}\\[~]|€";

    private SmsSegmenter() {}

    public static Encoding encodingOf(String text) {
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (GSM7_BASIC.indexOf(c) < 0 && GSM7_EXT.indexOf(c) < 0) {
                return Encoding.UCS2;
            }
        }
        return Encoding.GSM7;
    }

    public static Count count(String text) {
        Encoding enc = encodingOf(text);
        int units;
        if (enc == Encoding.GSM7) {
            units = 0;
            for (int i = 0; i < text.length(); i++) {
                units += GSM7_EXT.indexOf(text.charAt(i)) >= 0 ? 2 : 1;
            }
        } else {
            // UCS-2 = unidades de 16 bits = code units UTF-16.
            units = text.length();
        }
        int single = enc == Encoding.GSM7 ? Count.SINGLE_GSM7 : Count.SINGLE_UCS2;
        int concat = enc == Encoding.GSM7 ? Count.CONCAT_GSM7 : Count.CONCAT_UCS2;
        int segments = units <= single ? 1 : (int) Math.ceil((double) units / concat);
        return new Count(enc, units, segments);
    }
}

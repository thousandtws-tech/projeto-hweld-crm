package com.hweld.operations.notification.application;

/**
 * Normalização de telefone para E.164 — Brasil assume DDI 55 quando o número
 * vem local (10-11 dígitos com DDD); internacional exige `+` ou DDI explícito.
 */
public final class PhoneNormalizer {

    private static final String BR_DDI = "55";

    private PhoneNormalizer() {}

    /** @return E.164 (`+` + dígitos) ou null quando inválido. */
    public static String toE164(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String s = raw.strip();
        boolean hasPlus = s.startsWith("+");
        String digits = s.replaceAll("[^0-9]", "");
        if (digits.isEmpty()) return null;

        if (!hasPlus && digits.startsWith(BR_DDI)
                && (digits.length() == 12 || digits.length() == 13)) {
            return "+" + digits;
        }
        if (!hasPlus && (digits.length() == 10 || digits.length() == 11)) {
            return "+" + BR_DDI + digits;
        }
        if (digits.length() >= 7 && digits.length() <= 15) {
            return "+" + digits;
        }
        return null;
    }
}

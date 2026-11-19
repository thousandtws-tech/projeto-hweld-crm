package com.hweld.operations.shared.infrastructure.security;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/**
 * Cifra simétrica dos segredos de integração guardados no banco (API keys,
 * segredos de webhook) — AES-256-GCM com IV aleatório por registro, formato
 * `base64(iv ‖ ciphertext ‖ tag)`. A chave vem de `INTEGRATION_SECRETS_KEY`
 * (hex-64, base64 ou texto → SHA-256); sem ela, deriva de `JWT_SECRET` —
 * segredos nunca ficam em claro nem dependem de constante do repositório.
 */
@Component
public class CredentialCipher {

    private static final Logger log = LoggerFactory.getLogger(CredentialCipher.class);
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;

    private final SecretKeySpec key;
    private final SecureRandom random = new SecureRandom();

    public CredentialCipher(Environment env) {
        String explicit = env.getProperty("hweld.integrations.secrets-key");
        String jwt = env.getProperty("hweld.security.jwt-secret");
        String fonte = explicit != null && !explicit.isBlank() ? explicit : jwt;
        if (fonte == null || fonte.isBlank()) {
            throw new IllegalStateException(
                    "sem chave para cifrar segredos de integração — defina "
                            + "INTEGRATION_SECRETS_KEY ou JWT_SECRET");
        }
        this.key = new SecretKeySpec(deriveKey(fonte.trim()), "AES");
        if (explicit == null || explicit.isBlank()) {
            log.info("credential cipher: chave derivada de JWT_SECRET "
                    + "(defina INTEGRATION_SECRETS_KEY para isolá-la)");
        }
    }

    public String encrypt(String plain) {
        if (plain == null) return null;
        try {
            byte[] iv = new byte[IV_BYTES];
            random.nextBytes(iv);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            byte[] ct = c.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(
                    ByteBuffer.allocate(iv.length + ct.length).put(iv).put(ct).array());
        } catch (Exception e) {
            throw new IllegalStateException("falha ao cifrar segredo de integração", e);
        }
    }

    public String decrypt(String encoded) {
        if (encoded == null) return null;
        try {
            byte[] blob = Base64.getDecoder().decode(encoded);
            byte[] iv = new byte[IV_BYTES];
            byte[] ct = new byte[blob.length - IV_BYTES];
            System.arraycopy(blob, 0, iv, 0, IV_BYTES);
            System.arraycopy(blob, IV_BYTES, ct, 0, ct.length);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            return new String(c.doFinal(ct), StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException("falha ao decifrar segredo de integração", e);
        }
    }

    private static byte[] deriveKey(String fonte) {
        try {
            if (fonte.matches("(?i)[0-9a-f]{64}")) {
                byte[] k = new byte[32];
                for (int i = 0; i < 32; i++) {
                    k[i] = (byte) Integer.parseInt(fonte.substring(i * 2, i * 2 + 2), 16);
                }
                return k;
            }
            byte[] raw;
            try {
                raw = Base64.getDecoder().decode(fonte);
            } catch (IllegalArgumentException notB64) {
                raw = null;
            }
            return raw != null && raw.length == 32 ? raw
                    : MessageDigest.getInstance("SHA-256")
                            .digest(fonte.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException("falha ao derivar chave de cifra", e);
        }
    }
}

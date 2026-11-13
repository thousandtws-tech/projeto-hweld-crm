package com.hweld.operations.shared.infrastructure.storage;

import com.hweld.operations.shared.application.ObjectStorage;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Adapter MinIO/S3 — path-style `PUT/GET/DELETE /{bucket}/{key}` assinado
 * com AWS Signature V4 sobre `java.net.http` (JDK puro, zero dependência
 * extra — mesma abordagem do adapter Rust no core-api).
 */
@Component
@ConditionalOnProperty("hweld.storage.endpoint")
public class MinioObjectStorage implements ObjectStorage {

    private static final Logger log = LoggerFactory.getLogger(MinioObjectStorage.class);
    private static final String ALGORITMO = "AWS4-HMAC-SHA256";
    private static final String SIGNED = "host;x-amz-content-sha256;x-amz-date";
    private static final DateTimeFormatter AMZ = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'")
            .withZone(ZoneOffset.UTC);
    private static final DateTimeFormatter DATA = DateTimeFormatter.ofPattern("yyyyMMdd")
            .withZone(ZoneOffset.UTC);

    private final HttpClient client = HttpClient.newHttpClient();
    private final StorageProperties props;
    private final String host;

    public MinioObjectStorage(StorageProperties props) {
        this.props = props;
        String semBarra = props.endpoint().replaceAll("/+$", "");
        this.host = URI.create(semBarra).getHost()
                + (URI.create(semBarra).getPort() > 0 ? ":" + URI.create(semBarra).getPort() : "");
        log.info("storage: MinIO em {} bucket={}", semBarra, props.bucket());
        garantirBucket();
    }

    /** Bootstrap idempotente — `PUT /{bucket}`; 409 (já existe) é OK. */
    private void garantirBucket() {
        String amzDate = amzDate();
        String vazio = sha256Hex(new byte[0]);
        String uri = "/" + props.bucket();
        String canonico = "PUT\n" + uri + "\n\n"
                + "host:" + host + "\n"
                + "x-amz-content-sha256:" + vazio + "\n"
                + "x-amz-date:" + amzDate + "\n\n"
                + SIGNED + "\n" + vazio;
        HttpRequest req = assinar(HttpRequest.newBuilder(
                        URI.create(props.endpoint().replaceAll("/+$", "") + uri)),
                canonico, amzDate, vazio)
                .PUT(HttpRequest.BodyPublishers.noBody())
                .build();
        HttpResponse<byte[]> resp = enviar(req);
        if (resp.statusCode() == 200 || resp.statusCode() == 409) {
            log.info("storage: bucket {} pronto ({})", props.bucket(), resp.statusCode());
            return;
        }
        exige2xx(resp, "mkdir");
    }

    @Override
    public void salvar(String chave, byte[] bytes, String mime) {
        HttpRequest req = request("PUT", chave, sha256Hex(bytes), amzDate())
                .PUT(HttpRequest.BodyPublishers.ofByteArray(bytes))
                .header("Content-Type", mime)
                .build();
        HttpResponse<byte[]> resp = enviar(req);
        exige2xx(resp, "put");
    }

    @Override
    public byte[] ler(String chave) {
        HttpRequest req = request("GET", chave, sha256Hex(new byte[0]), amzDate())
                .GET().build();
        HttpResponse<byte[]> resp = enviar(req);
        if (resp.statusCode() == 404) {
            return null;
        }
        exige2xx(resp, "get");
        return resp.body();
    }

    @Override
    public void remover(String chave) {
        HttpRequest req = request("DELETE", chave, sha256Hex(new byte[0]), amzDate())
                .DELETE().build();
        HttpResponse<byte[]> resp = enviar(req);
        if (resp.statusCode() != 404) {
            exige2xx(resp, "delete");
        }
    }

    // ── SigV4 ───────────────────────────────────────────────────────────────

    private HttpRequest.Builder request(String metodo, String chave, String payloadHash, String amzDate) {
        String uri = "/" + props.bucket() + "/" + chave;
        String canonico = metodo + "\n" + uri + "\n\n"
                + "host:" + host + "\n"
                + "x-amz-content-sha256:" + payloadHash + "\n"
                + "x-amz-date:" + amzDate + "\n\n"
                + SIGNED + "\n" + payloadHash;
        return assinar(HttpRequest.newBuilder(
                        URI.create(props.endpoint().replaceAll("/+$", "") + uri)),
                canonico, amzDate, payloadHash);
    }

    /** SigV4 — aplica `Authorization`, `x-amz-date` e `x-amz-content-sha256`. */
    private HttpRequest.Builder assinar(HttpRequest.Builder builder,
            String canonico, String amzDate, String payloadHash) {
        String datastamp = amzDate.substring(0, 8);
        String escopo = datastamp + "/" + props.region() + "/s3/aws4_request";
        String toSign = ALGORITMO + "\n" + amzDate + "\n" + escopo + "\n" + sha256Hex(canonico.getBytes(StandardCharsets.UTF_8));

        byte[] kData = hmac(("AWS4" + props.secretKey()).getBytes(StandardCharsets.UTF_8), datastamp.getBytes(StandardCharsets.UTF_8));
        byte[] kRegiao = hmac(kData, props.region().getBytes(StandardCharsets.UTF_8));
        byte[] kServico = hmac(kRegiao, "s3".getBytes(StandardCharsets.UTF_8));
        byte[] kSigning = hmac(kServico, "aws4_request".getBytes(StandardCharsets.UTF_8));
        String assinatura = hex(hmac(kSigning, toSign.getBytes(StandardCharsets.UTF_8)));

        String auth = ALGORITMO + " Credential=" + props.accessKey() + "/" + escopo
                + ", SignedHeaders=" + SIGNED + ", Signature=" + assinatura;

        return builder
                .header("Authorization", auth)
                .header("x-amz-date", amzDate)
                .header("x-amz-content-sha256", payloadHash);
    }

    private String amzDate() {
        return ZonedDateTime.now(ZoneOffset.UTC).format(AMZ);
    }

    private HttpResponse<byte[]> enviar(HttpRequest req) {
        try {
            return client.send(req, HttpResponse.BodyHandlers.ofByteArray());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("storage interrompido", e);
        } catch (java.io.IOException e) {
            throw new IllegalStateException("storage: falha de rede", e);
        }
    }

    private void exige2xx(HttpResponse<byte[]> resp, String op) {
        if (resp.statusCode() < 200 || resp.statusCode() > 299) {
            String corpo = new String(resp.body(), StandardCharsets.UTF_8);
            throw new IllegalStateException(
                    "storage " + op + " → " + resp.statusCode() + ": " + corpo.substring(0, Math.min(corpo.length(), 300)));
        }
    }

    static String sha256Hex(byte[] bytes) {
        try {
            return hex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (Exception e) {
            throw new IllegalStateException("sha256", e);
        }
    }

    static byte[] hmac(byte[] key, byte[] msg) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return mac.doFinal(msg);
        } catch (Exception e) {
            throw new IllegalStateException("hmac", e);
        }
    }

    static String hex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(Character.forDigit((b >> 4) & 0xF, 16));
            sb.append(Character.forDigit(b & 0xF, 16));
        }
        return sb.toString();
    }
}

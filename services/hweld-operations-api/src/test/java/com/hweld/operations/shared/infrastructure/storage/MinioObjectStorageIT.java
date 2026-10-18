package com.hweld.operations.shared.infrastructure.storage;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/**
 * IT real contra o MinIO — só roda com MINIO_ENDPOINT/MINIO_ACCESS_KEY/
 * MINIO_SECRET_KEY no ambiente. `./mvnw test` sem credenciais pula.
 */
@EnabledIfEnvironmentVariable(named = "MINIO_ENDPOINT", matches = ".+")
class MinioObjectStorageIT {

    @Test
    void cicloPutGetDelete() {
        var props = new StorageProperties(
                System.getenv("MINIO_ENDPOINT"),
                System.getenv().getOrDefault("MINIO_BUCKET", "hweld"),
                "us-east-1",
                System.getenv("MINIO_ACCESS_KEY"),
                System.getenv("MINIO_SECRET_KEY"));
        var storage = new MinioObjectStorage(props);

        String chave = "it/" + UUID.randomUUID() + ".txt";
        byte[] conteudo = "storage it".getBytes(StandardCharsets.UTF_8);
        try {
            storage.salvar(chave, conteudo, "text/plain");
            assertThat(storage.ler(chave)).isEqualTo(conteudo);
        } finally {
            storage.remover(chave);
        }
        assertThat(storage.ler(chave)).isNull();
    }
}

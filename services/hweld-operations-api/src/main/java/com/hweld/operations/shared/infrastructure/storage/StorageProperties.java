package com.hweld.operations.shared.infrastructure.storage;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** `hweld.storage.*` — MinIO/S3. `endpoint` ausente = NoopObjectStorage. */
@ConfigurationProperties(prefix = "hweld.storage")
public record StorageProperties(
        String endpoint,
        String bucket,
        String region,
        String accessKey,
        String secretKey) {

    public StorageProperties {
        if (bucket == null || bucket.isBlank()) bucket = "hweld";
        if (region == null || region.isBlank()) region = "us-east-1";
    }
}

package com.hweld.operations.shared.infrastructure.storage;

import com.hweld.operations.shared.application.ObjectStorage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.stereotype.Component;

/**
 * Fallback sem MinIO — `ler` retorna null (endpoints de download → 404),
 * `salvar`/`remover` só logam. Dev sem infra não quebra.
 */
@Component
@ConditionalOnMissingBean(ObjectStorage.class)
public class NoopObjectStorage implements ObjectStorage {

    private static final Logger log = LoggerFactory.getLogger(NoopObjectStorage.class);

    @Override
    public void salvar(String chave, byte[] bytes, String mime) {
        log.warn("storage: ausente (hweld.storage.endpoint) — descartado {} ({} bytes)", chave, bytes.length);
    }

    @Override
    public byte[] ler(String chave) {
        return null;
    }

    @Override
    public void remover(String chave) {
        log.debug("storage: ausente — remover {} ignorado", chave);
    }

    @Override
    public boolean ativo() {
        return false;
    }
}

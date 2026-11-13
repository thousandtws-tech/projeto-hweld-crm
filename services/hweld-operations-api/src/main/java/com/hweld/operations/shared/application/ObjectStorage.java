package com.hweld.operations.shared.application;

/**
 * Port de object storage — blobs endereçados por chave
 * (`fiscal/{docId}.xml`, `midia/{uuid}.png`). A aplicação não conhece
 * o backend: MinIO/S3 em produção, no-op em dev.
 */
public interface ObjectStorage {

    /** Persiste `bytes` em `chave` com o MIME dado. */
    void salvar(String chave, byte[] bytes, String mime);

    /** Lê o objeto inteiro — `null` quando a chave não existe. */
    byte[] ler(String chave);

    /** Remove o objeto — ausência da chave não é erro (idempotente). */
    void remover(String chave);

    /** `true` quando há storage remoto configurado (não no-op). */
    default boolean ativo() {
        return true;
    }
}

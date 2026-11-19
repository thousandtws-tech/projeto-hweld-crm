package com.hweld.operations.shared.infrastructure.coreapi;

/**
 * Port de leitura mínima do contato no core-api para notificações —
 * canal service-to-service (`X-Service-Token`), usado por handlers de
 * evento que rodam assíncronos e não têm JWT de usuário.
 */
public interface ContatoGateway {

    /** Dados de notificação do contato — null quando não encontrado. */
    ContatoNotificacao getContato(long contatoId);

    record ContatoNotificacao(long contatoId, String email, String telefone) {}
}

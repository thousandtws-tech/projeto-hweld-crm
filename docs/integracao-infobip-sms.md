#
> **Atualização (v2 — credenciais do cliente):** a decisão "segredos via env"
> foi revertida — credenciais Infobip (Base URL, API key, remetente) passaram
> a ser gerenciadas pelo CLIENTE no painel (Integrações), cifradas AES-256-GCM
> em `integration_settings` (V9). `webhook_secret` é gerado no servidor e
> compõe o path do DLR (`/sms/dlr/{segredo}`). `SMS_PROVIDER=auto` usa Infobip
> quando credenciado, senão `log`. Envs restantes: `APP_PUBLIC_URL`,
> `INTEGRATION_SECRETS_KEY` (opcional, deriva de JWT_SECRET), `INFOBIP_TIMEOUT_MS`.
 Prompt para o Devin — Integração SMS Infobip no CRM HWeld

Repositório: projeto-hweld-crm (monorepo)
Produto: CRM + Portal B2B HWeld (soldas e reparos)
Provedor: https://www.infobip.com/
Escopo: exclusivamente SMS.
Adaptado de `prompt-devin-integracao-infobip.md` (crm-hotel-pousadas) em 19/11/2026.

## Início do prompt

Devin, implemente a integração **Infobip — SMS** no novo módulo **Administração → Integrações** do painel-admin.

O objetivo é configurar o serviço de SMS, enviar mensagens transacionais aos contatos B2B (empresas) e acompanhar os resultados dentro do CRM, cobrindo os eventos reais do fluxo de pedidos do portal.

**Esta entrega é somente SMS.** WhatsApp, RCS, voz, campanhas, OTP e chatbots não fazem parte do escopo. As notificações por e-mail existentes (`SmtpEmailProvider`/`LogEmailProvider`) devem continuar funcionando sem alteração — SMS é um canal adicional, nunca fallback automático do e-mail.

Entregue backend, frontend, migrations, testes e documentação. A funcionalidade deve operar pelos fluxos reais do sistema.

### 1. Inspecione e reutilize o projeto

Leia os AGENTS.md aplicáveis. Stack: painel-admin React/TS (TanStack Router, ui-kit próprio), operations-api Java 25/Spring Boot, core-api Rust/Actix, PostgreSQL compartilhado, realtime-engine Phoenix.

**Infraestrutura existente a reutilizar — não recriar:**

- Contexto `notification` da operations-api: `NotificationService` (fila QUEUED → dispatch agendado → retry exponencial → DEAD), `NotificationDelivery` (já possui coluna `channel`, hoje sempre `EMAIL`), `NotificationTemplate` + `TemplateRenderer` (variáveis `{{x}}`), `NotificationEventHandler` (mapa eventType → template), `NotificationController`.
- `shared`: `IntegrationEvent`, `IntegrationEventHandler`, `EventTypes`, outbox transacional (`shared.infrastructure.outbox`).
- Padrão de credenciais da Focus NFe: `FocusNFeProperties` (`@ConfigurationProperties`) — segredos via variáveis de ambiente do Railway, nunca no banco; webhook autenticado por header-token em `FiscalWebhookController`.
- Eventos de domínio já emitidos pelo core-api via `/api/v1/internal/events`: `ORDER_CREATED`, `PAYMENT_REQUESTED`, `PAYMENT_CONFIRMED`, `PAYMENT_FAILED`, `PAYMENT_EXPIRED`, `INVOICE_AUTHORIZED`, `INVOICE_REJECTED` etc.
- Telefone do destinatário: `contato.telefone` / `empresa.telefone` (VARCHAR(20), migração 0003_crm.sql). Os payloads de evento hoje carregam `contatoEmail` — incluir `contatoTelefone` onde necessário.

Não presuma que especificações anteriores viraram código. Apresente diagnóstico breve e implemente seguindo as camadas existentes (domain → application → infrastructure → interfaces). Não introduza outra linguagem, banco, microserviço ou broker.

### 2. Módulo Integrações e card no painel-admin

Crie o módulo **Integrações** na seção Administração do `AppShell` (rota `/admin/integracoes`), seguindo o padrão visual dos módulos atuais. Card **Infobip — SMS**, categoria **Comunicação**.

Exiba estado da configuração, remetente, última validação, último envio e pendências. Disponibilize:

- Configurar.
- Testar conexão.
- Enviar SMS de teste.
- Consultar histórico.
- Ativar/pausar novos envios.

Configuração dividida em dois níveis (padrão do projeto):

- **Segredos via env/Railway** (`INFOBIP_BASE_URL`, `INFOBIP_API_KEY`, `INFOBIP_SENDER`, `INFOBIP_DLR_TOKEN`) — o card mostra "configurado/ausente" e nunca o valor. Edição de segredo é operação de infra, não de CRM.
- **Toggles operacionais persistidos** (tabela própria): envio ativado, eventos habilitados para SMS, remetente exibido, limite de segmentos por mensagem, destinatários permitidos para teste. Editáveis pelo card com permissão adequada.

Diferencie credencial válida, remetente habilitado, callback configurado e envio ativado. Não mostre "pronto para uso" se alguma dependência estiver pendente.

"Testar conexão" usa apenas consultas documentadas sem enviar mensagens (ex.: leitura de perfil/configuração da conta quando disponível). Se uma capacidade não puder ser validada por consulta, exiba "não verificada". Não use envio cobrável escondido como teste.

"Enviar SMS de teste" é ação separada, com destinatário explícito restrito à lista configurada, prévia do texto e indicação de possível cobrança. Respeite restrições de trial da conta.

### 3. API e credenciais

Documentação oficial vigente; autenticação `Authorization: App {API_KEY}` e envio em `POST https://{BASE_URL}/sms/3/messages` (contrato ilustrativo no prompt original — revalidar na doc atual, não enviar valores fictícios).

Implemente `InfobipProperties` (`@ConfigurationProperties(prefix = "hweld.notification.infobip")`) seguindo `FocusNFeProperties`: URLs e segredos via env, defaults sensatos, fail-fast com mensagem clara quando obrigatório falta. Valide a Base URL: hosts oficiais Infobip (incl. variantes regionais documentadas), HTTPS obrigatório, proibir hosts privados/localhost, não seguir redirect que vaze a API key para outro host.

`InfobipSmsProvider implements SmsProvider` (port novo, irmão de `EmailProvider`) em `notification/infrastructure`, com timeouts configuráveis e erros tipados: credencial inválida, sem permissão SMS, remetente inválido, restrição da conta, rate limit (`Retry-After` respeitado), falha transitória. Sanitizar logs — nunca registrar API key, telefone completo ou corpo da mensagem.

Não invente endpoints de health check, saldo ou SDKs oficiais.

### 4. Remetente, telefone e conteúdo SMS

Remetente: usar o configurado/habilitado na conta; não presumir que alfanumérico "HWELD" ou o número da empresa está autorizado — refletir no estado do card.

Telefone: normalizar para o formato exigido pela API (E.164). `contato.telefone` é texto livre — validar país/DDI/DDD, preservar internacionais, não prefixar 55 indiscriminadamente (aplicar regra BR documentada). Validar no frontend e no backend; telefone ausente/inválido gera pendência operacional, não exceção.

Templates: estender `notification_templates` para suportar `channel` (EMAIL|SMS) e templates de texto puro SMS com as mesmas variáveis `{{...}}` do `TemplateRenderer`. SMS não usa janela, botões nem aprovação de template do WhatsApp.

Mensagens identificam a HWeld, são curtas e contêm apenas o necessário. Nunca documentos pessoais, dados de cartão ou credenciais. Links somente no domínio público do portal.

Exemplos (revalidar contra dados reais do evento):

> HWeld: pedido {{numero}} confirmado. Acompanhe em {{link_pedido}}

> HWeld: pedido {{numero}} recebido. Pagamento pendente — instruções em {{link_pedido}}

> HWeld: orçamento {{numero}} aprovado. Pedido {{pedido}} gerado. Detalhes: {{link_pedido}}

Campos obrigatórios ausentes impedem o envio e viram pendência operacional.

### 5. Tamanho, encoding e custo

Calcule segmentação após substituir variáveis, incluindo o link final. GSM-7 e Unicode conforme o contrato: 160/70 caracteres (simples), 153/67 por parte (concatenada); valide com implementação adequada (extensão GSM-7 conta 2 unidades, Unicode cobre acentos conforme tabela, não "todo acentuado igual").

Teste acentos, extensão GSM-7, emojis e limites de concatenação. Prévia deve mostrar encoding e estimativa de segmentos. Limite configurável impede mensagens excessivamente longas. Não remova acentos silenciosamente — transliteração só como opção explícita.

Registre as partes efetivas retornadas pelo provedor. Custo/moeda só exibidos vindos de fonte confiável da conta; estimativas identificadas como tal. Não codifique preços nem prometa SMS gratuito.

### 6. Eventos e ativação

Gatilhos SMS configuráveis sobre os eventos reais do `EventTypes`:

| Situação | Evento | Comunicação |
| --- | --- | --- |
| Pedido criado no portal | `OrderCreated` | Recebimento e próxima etapa |
| Pagamento solicitado/pendente | `PaymentRequested` | Orientação de pagamento |
| Pagamento confirmado | `PaymentConfirmed` | Confirmação e resumo/link |
| Pagamento falhou ou expirou | `PaymentFailed` / `PaymentExpired` | Alerta e retry orientado |
| NF-e autorizada | `InvoiceAuthorized` | Aviso de emissão (opcional, off por default) |

Pedido confirmado não implica quitação integral — respeite os estados financeiros reais do backend.

Dispare após persistência do evento/outbox, nunca por refresh de tela. Mensagem de pendência que se torna obsoleta antes do envio deve ser suprimida em favor da atualização correta (ex.: `PaymentConfirmed` chegou antes do envio do aviso de pendência).

**Todos os gatilhos SMS nascem desativados** até configuração e ativação pela operação. A interface deve deixar claro quais eventos já notificam por e-mail. O escopo é transacional — nada de opt-in promocional ou campanhas.

### 7. Envio assíncrono, persistência e duplicidade

Reutilize a fila existente: intenção gravada na mesma TX do evento (outbox → `NotificationEventHandler` → `NotificationService.queue` com `channel=SMS`), dispatch assíncrono pelo scheduler atual. Indisponibilidade da Infobip não pode afetar pedido nem checkout.

Estenda `notification_deliveries` (ou tabela irmã) para registrar: intenção, evento/pedido de origem, canal SMS, destinatário, modelo e versão, conteúdo renderizado, config utilizada, tentativas, `next_retry_at`, `bulkId`/`messageId`, segmentos, status final e erro sanitizado.

Garanta:

- Deduplicação por evento/transição + canal + destinatário, com restrição única no banco.
- Concorrência segura entre workers (padrão `claimed` do outbox — ver V5) e recuperação após restart.
- Revalidação de elegibilidade e estado atual antes de enviar.
- Retry limitado com backoff/jitter (reusar props `hweld.notification`), honrando `Retry-After`.
- Tratamento para erros permanentes → DEAD com motivo.
- Resultado ambíguo após timeout: não reenviar cegamente — estado `UNKNOWN`/conciliação documentada.

`messageId` é correlação, não idempotência remota — documente a garantia efetiva e duplicidade residual. Reenvio manual é ação explícita, autorizada e auditada, preservando a tentativa original.

### 8. Relatórios de entrega (DLR)

Novo `InfobipWebhookController` (padrão `FiscalWebhookController`) em `POST /api/v1/webhooks/infobip/sms/dlr`, autenticado por header-token (`INFOBIP_DLR_TOKEN`) configurado no notification profile da Infobip — informar a URL no envio não habilita autenticação sozinha. HTTPS obrigatório.

Aceitação HTTP/`PENDING` não comprova entrega. Mapeie estados internos: aguardando, aceito, entregue, falhou, expirado, desconhecido, suprimido — outros somente com evidência do provedor. **Nunca exiba "lido" para SMS.**

Preserve códigos remotos de status/erro (`status.groupId/groupName/id/name`, `error`). Diferencie falha local de falha reportada pelo provedor. Persista o report bruto antes de responder 200; processe durável; trate lote (`results[]`), duplicados, fora de ordem e reports anteriores à gravação do envio — evento atrasado não rebaixa estado final.

Ao pausar novos envios, continue recebendo DLRs de mensagens antigas. Ausência de DLR gera estado pendente/desconhecido e conciliação — nunca reenvio automático.

Escopo: envio + DLR. Não prometa SMS bidirecional (resposta do cliente) — depende de número/país/serviço e fica para extensão específica.

### 9. Histórico, operação e segurança

Histórico de SMS no card da integração e no detalhe do pedido/empresa: destinatário mascarado, conteúdo conforme permissão, remetente, modelo, segmentos, horários, status, tentativas e motivo de falha.

Filtros por período, pedido/empresa e status; pendências visíveis; reprocessamento com permissão, confirmação, rate limit e auditoria (mesma trilha do `/auditoria`). Destaque resultados desconhecidos antes do reenvio.

RBAC por `perfis` (padrão AppShell): configurar/ativar/testar/ver conteúdo/reenviar — mínimo `admin`. Sem segredos ou PII em logs e métricas; aplicar retenção do projeto e documentar o compartilhamento de dados com a Infobip (LGPD).

### 10. Testes e entrega

Cubra na suíte (JUnit na operations-api; vitest/e2e no painel-admin):

1. Config via env, segredo protegido, RBAC, bloqueio de Base URL insegura.
2. Credencial/escopo/remetente inválidos e restrições de trial.
3. Teste de conexão sem envio; SMS de teste só ao destinatário configurado.
4. Telefones BR e internacionais, ausentes e malformados.
5. Templates completos/incompletos; GSM-7, Unicode e segmentação.
6. Pedido criado vs. pagamento confirmado; evento repetido; mensagem obsoleta suprimida.
7. Concorrência do scheduler, restart e recuperação; dedup na constraint.
8. Rate limit + `Retry-After`, falha permanente → DEAD, timeout ambíguo.
9. DLR autenticado/inválido, lote, duplicado, fora de ordem, sem correlação.
10. Histórico, pausa com DLRs antigos, reenvio auditado, ausência de "lido".
11. Gatilhos desativados inicialmente e e-mail existente intacto.

Mocks na suíte; validação real somente com conta/remetente habilitados e destinatários de teste explícitos.

Fluxo de validação: definir envs → card reflete estado → testar conexão → SMS de teste → receber DLR → histórico → ativar gatilho → criar pedido no portal → SMS processado.

Entregue código, migrations (templates SMS seed, colunas/constraint de dedup, tabela de toggles), `.env.example` atualizado (`INFOBIP_*` sem segredos), documentação operacional e evidências. Se faltarem credenciais ou remetente habilitado, conclua a implementação testável e liste a dependência exata para o envio real.

## Referências oficiais

- Autenticação: https://www.infobip.com/docs/developer-resources/authentication-and-access/api-authentication
- API SMS e DLR: https://www.infobip.com/docs/api/sms-api
- Subscriptions e segurança de callbacks: https://www.infobip.com/docs/subscriptions · https://www.infobip.com/docs/subscriptions/manage/authentication-settings

## Status da implementação (2026-04)

Implementado conforme esta especificação — SMS integrado à fila transacional existente, sem novo serviço/banco/broker.

**Backend (`hweld-operations-api`, Java)**
- `V8__infobip_sms.sql` — canais `EMAIL|SMS` em templates/entregas; status SMS (`ACCEPTED/DELIVERED/EXPIRED/SUPPRESSED/UNKNOWN`); colunas `dedup_key` (única), `message_id`, `bulk_id`, `segments`, `remote_status`, `delivered_at`, `source_event_id`, `pedido_id`, `dlr` JSONB; `payments.contato_telefone`; `integration_settings` (toggles); seed de 7 templates `sms_*`.
- `InfobipProperties` (`hweld.notification.infobip`, env `INFOBIP_*`) — HTTPS obrigatório, credenciais só por env.
- `SmsProvider` (port) → `InfobipSmsProvider` (`POST /sms/3/messages`, `Authorization: App {key}`, erros tipados `SmsSendException.Kind` com `Retry-After`) e `LogSmsProvider` (dev default). `testConnection()` = `GET /account/1/balance` read-only, sem custo.
- `PhoneNormalizer` (E.164, BR default DDI 55) + `SmsSegmenter` (GSM-7/UCS-2, concat 153/67).
- `NotificationService` despacha por canal; `queueSms` com dedup por `dedup_key`, normalização, segmentação e SUPPRESSED auditável (telefone inválido / excede max_segmentos). SMS `SENT` sem DLR além de `dlr-reconcile-age-ms` (6h) → `UNKNOWN` (sem reenvio automático).
- `SmsNotificationEventHandler` — gatilhos por evento (todos desligados por padrão), telefone do payload `contatoTelefone` ou via `contatoId` → `GET /internal/contatos/{id}/notificacao` (core-api, `X-Service-Token`); supressão de cobrança pendente em `PaymentConfirmed/Expired/Cancelled`.
- `InfobipWebhookController` `POST /api/v1/webhooks/infobip/sms/dlr` — header-token constant-time, lote, monotônico (DELIVERED nunca rebaixado), sem correlação contado não falha.
- `IntegrationController` `/api/v1/integracoes/infobip` (ROLE_STAFF_ADMIN): status, `PUT /config`, `POST /testar-conexao`, `POST /sms-teste` (restrito a `test_recipients`), `POST /deliveries/{id}/reprocessar` (audita; UNKNOWN exige confirmação consciente), `GET /historico`.

**Core-api (Rust)** — `GET /api/v1/internal/contatos/{id}/notificacao` (`AuthServico`) retornando `{id,email,telefone}` para resolução assíncrona de destinatários.

**Painel-admin** — `/admin/integracoes` (admin-only): card "Infobip — SMS" (Comunicação) com estado por dependência, pendências explícitas, toggles por evento, Testar conexão, SMS de teste (destinatário da lista + preview + aviso de custo), ativar/pausar, histórico com filtros status/pedido e reprocessar auditado.

**E-mail** — caminho inalterado; `EMAIL_PROVIDER`/`SMTP_*` intactos.

**Pendência externa para envio real**: conta Infobip com permissão SMS, remetente autorizado, `INFOBIP_BASE_URL/API_KEY/SENDER/DLR_AUTH_TOKEN/WEBHOOK_URL` e callback DLR registrado no painel apontando para `/api/v1/webhooks/infobip/sms/dlr`. Contas trial exigem destinatários verificados no Infobip (a lista `test_recipients` do painel reforça essa restrição).

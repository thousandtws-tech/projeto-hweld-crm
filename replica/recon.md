# Recon Map — HWeld (cliente-web + painel-administrativo)

> Reconstrução clean-room dos **padrões de UX e funcionalidade** de e-commerce
> B2B, usando Mercado Livre e Loja do Mecânico como referência de fluxo — sobre
> o modelo real do backend HWeld (Rust/Actix, já implementado).
> Referências: https://www.mercadolivre.com.br/ · https://www.lojadomecanico.com.br/

## 1. Escopo

| Pergunta | Resposta |
| --- | --- |
| App / plataforma | HWeld — **web** (dois apps Angular 22: `cliente-web` e `painel-administrativo`) |
| Fatia | **Loop central**: portal B2B (catálogo → busca → produto → carrinho → checkout → pedido) + backoffice completo (CRM, catálogo, pedidos, estoque, OS, fiscal, financeiro, auditoria) |
| Para quem | Negócio próprio do usuário — distribuidora de solda/ferramentas (B2B: o cliente do portal é a empresa, quem loga é o contato) |

Diferença-chave vs. referências: ML é marketplace B2C (milhares de vendedores,
preço público). HWeld é **single-seller B2B com preço por tabela** — cada
empresa vê o preço da sua `tabela_preco`. Os padrões de UX (busca com
autocomplete, facetas, PDP, checkout, meus pedidos) são reaproveitados; o que
é próprio de marketplace (seller page, reputação, perguntas públicas,
anúncios) **não se aplica**.

## 2. Fontes

| Fonte | URL | O que deu |
| --- | --- | --- |
| Loja do Mecânico — home | https://www.lojadomecanico.com.br/ | Header (busca, CEP, conta, carrinho), mega-menu 3 níveis, product card (Pix/boleto à vista + parcelado), badges de frete, `/meu-espaco/pedidos`, footer institucional |
| Estrutura de rotas LdM | `/categorias/{id}/{slug}`, `/subcategorias/...`, `/produto/{id}/...`, `/busca?q=`, `/login`, `/tipo-pessoa`, `/institucional/*` | Padrão de URL com id+slug, páginas institucionais |
| Mercado Livre — padrões públicos de UX | https://www.mercadolivre.com.br/ (bloqueia fetch — 403; padrões são públicos/conhecidos) | Autocomplete, facetas laterais (categoria/marca/preço), PDP com galeria+parcelamento+CEP, stepper de checkout, "Minhas compras" |
| **Backend real** | `server/workspace/crates/api/src/rotas.rs` · `migrations/0001-0009` · `dto.rs` · Swagger em `/api-docs/openapi.json` | O modelo de dados completo, todas as operações (94), máquinas de estado, dois contextos de auth |
| README do backend | `server/workspace/README.md` | Arquitetura hexagonal, auth staff/portal, Elasticsearch, decisões (Dinheiro, estoque projeção, auditoria append-only) |

## 3. Inventário de telas

### 3.1 `cliente-web` — Portal B2B (token `portal:<id>`)

| ID | Tela | Rota | Propósito | Componentes-chave | Estados |
| --- | --- | --- | --- | --- | --- |
| S01 | Login portal | `/login` | Contato entra com email+senha | form, logo, erro inline | default, erro credenciais, loading |
| S02 | Home / vitrine | `/` | Entrada: banner, categorias, destaques | hero banner, category tiles, product rail, product card | filled, loading (skeleton), vazio sem destaques |
| S03 | Categoria | `/c/{id}-{slug}` | Listar produtos da categoria (árvore) | breadcrumb, subcategory chips, product grid, facet sidebar, paginação | filled, loading, vazio |
| S04 | Busca | `/busca?q=` | Resultados full-text + facetas | search header, facet sidebar (categoria/marca/faixa de preço), sort select, grid | filled, zero results (sugestões/spell), loading |
| S05 | Produto (PDP) | `/p/{id}-{slug}` | Detalhe: galeria, preço da tabela, specs, compra | gallery, price block, qty stepper, spec table, CTA add cart | filled, indisponível/sem estoque, loading |
| S06 | Carrinho | `/carrinho` | Revisar itens, qtd, remover | line items, qty stepper, subtotal card, empty state | filled, vazio, loading |
| S07 | Checkout | `/checkout` | Endereço faturamento + entrega, condição pagamento | address selector cards, condição select, observações, resumo | filled, erro endereço faltando, loading, submit |
| S08 | Confirmação | `/checkout/sucesso/{pedidoId}` | Pedido criado, número, próximos passos | success card, número do pedido, resumo | filled |
| S09 | Meus pedidos | `/conta/pedidos` | Lista de pedidos do contato/empresa | order cards com status chip, filtro status, paginação | filled, vazio, loading |
| S10 | Detalhe do pedido | `/conta/pedidos/{id}` | Status timeline, itens, endereços, total | status stepper, items table, address cards | filled, loading |
| S11 | Minha conta | `/conta` | Dados do contato, empresa, endereços | profile card, address list | filled |
| S12 | Segurança | `/conta/seguranca` | Trocar senha | form senha atual/nova | default, erro, sucesso |
| S13 | Não autorizado / erro | `/403`, `/404`, `/503` | Acesso negado, rota inexistente, busca fora (ES off) | error state ilustrado + CTA | — |

Wireframe-base das telas centrais (blocos, não pixels):

```
S02 Home                         S05 Produto (PDP)
┌────────────────────────────┐   ┌──────────────────────────────┐
│ topbar: logo busca conta 🛒│   │ breadcrumb: Home/Solda/MIG   │
│ mega-menu categorias       │   ├────────────┬─────────────────┤
├────────────────────────────┤   │  galeria   │ SKU · marca     │
│ hero banner                │   │  (thumbs)  │ Título          │
├────────────────────────────┤   │            │ R$ tabela B2B   │
│ tiles de categorias        │   │            │ qtd [− 1 +]     │
├────────────────────────────┤   │            │ [Add carrinho]  │
│ rail "Destaques"           │   │            │ estoque/status  │
│ [card][card][card][card]   │   ├────────────┴─────────────────┤
├────────────────────────────┤   │ specs técnicas (NCM, dims)   │
│ footer institucional       │   │ descrição                    │
└────────────────────────────┘   └──────────────────────────────┘

S04 Busca                        S07 Checkout
┌────────────────────────────┐   ┌──────────────────────────────┐
│ "102 resultados p/ 'mig'"  │   │ 1. Faturamento [endereço ▾]  │
├──────────┬─────────────────┤   │ 2. Entrega     [endereço ▾]  │
│ Categoria│ sort: relevância│   │ 3. Pagamento   [condição ▾]  │
│  ☐ Solda │ ┌─────────────┐ │   │ 4. Observações [textarea ]   │
│  ☐ EPI   │ │ grid cards  │ │   ├──────────────────────────────┤
│ Marca    │ │             │ │   │ resumo: itens, subtotal,     │
│  ☐ Esab  │ └─────────────┘ │   │ frete, total → [Finalizar]   │
│  ☐ V8    │ paginação       │   └──────────────────────────────┘
│ Preço min–max             │
└──────────┴─────────────────┘
```

### 3.2 `painel-administrativo` — Backoffice staff (token `staff:<id>`, RBAC por `Perfil`)

| ID | Tela | Rota | Propósito | Componentes-chave | Estados |
| --- | --- | --- | --- | --- | --- |
| A01 | Login staff | `/login` | Auth staff | form | default, erro, loading |
| A02 | Dashboard | `/` | KPIs: pedidos hoje, faturamento, estoque baixo, OS abertas | stat cards, charts, listas | filled, loading |
| A03 | Empresas | `/crm/empresas` | Lista + filtros (status, busca) | data table, status chip, filtros | filled, vazio |
| A04 | Empresa detalhe | `/crm/empresas/{id}` | 360°: dados, contatos, endereços, oportunidades, orçamentos, timeline | tabs, timeline, sub-tabelas | filled, loading |
| A05 | Empresa form | modal ou `/crm/empresas/nova` | Criar/editar (CNPJ, IE, tabela de preço) | form CNPJ mask, select tabela | default, validação |
| A06 | Contatos | `/crm/contatos` | Lista por empresa; ativar portal | data table, toggle acesso_portal | filled |
| A07 | Funil (kanban) | `/crm/oportunidades` | Cards por estágio lead→ganha/perdida | kanban board, drag, card valor | filled, vazio por coluna |
| A08 | Oportunidade drawer | `/crm/oportunidades/{id}` | Editar, mover estágio, motivo perda, interações | drawer, timeline, form | filled |
| A09 | Orçamentos | `/vendas/orcamentos` | Lista por status/empresa/vendedor | data table, status chip | filled |
| A10 | Orçamento editor | `/vendas/orcamentos/{id}` | Itens, desconto, frete, validade, transições, **converter→pedido** | items editor, totals, action bar | rascunho, enviado, aprovado, convertido |
| A11 | Pedidos | `/vendas/pedidos` | Lista por status/origem/empresa | data table, chips | filled |
| A12 | Pedido detalhe | `/vendas/pedidos/{id}` | Itens, timeline de status, pagamentos, NF, transições | status stepper, items table, payment list, actions | cada um dos 8 status |
| A13 | Pedido manual | `/vendas/pedidos/novo` | Televendas: monta pedido p/ empresa | empresa picker, items editor, endereços | default |
| A14 | Categorias | `/catalogo/categorias` | Árvore categoria→sub | tree table, reorder, form | filled |
| A15 | Produtos | `/catalogo/produtos` | Lista filtro categoria/ativo/destaque | data table, thumb, chips | filled |
| A16 | Produto form | `/catalogo/produtos/{id}` | SKU, fiscal (NCM, origem), dims, preços, imagens | tabbed form, image manager, currency fields | novo, editar, validação |
| A17 | Tabelas de preço | `/catalogo/tabelas-preco` | Lista tabelas ativas | data table | filled |
| A18 | Tabela detalhe | `/catalogo/tabelas-preco/{id}` | Definir preço por produto | editable grid, produto picker | filled |
| A19 | Estoque saldos | `/estoque/saldos` | Saldo por produto | data table, badge baixo | filled |
| A20 | Movimentações | `/estoque/movimentacoes` | Extrato append-only por produto | data table, filtro | filled |
| A21 | Lançar movimentação | modal em A19/A20 | Entrada/saída/ajuste com motivo | form tipo+qtd+motivo | default |
| A22 | Abaixo do mínimo | `/estoque/abaixo-minimo` | Alerta de reposição | data table com déficit | filled, vazio |
| A23 | Ordens de serviço | `/operacao/ordens` | Lista por status/prioridade/responsável | data table, prioridade chip | filled |
| A24 | OS detalhe | `/operacao/ordens/{id}` | Consumir material (baixa estoque), histórico, transições | material picker, timeline, actions | cada status |
| A25 | Notas fiscais | `/fiscal/notas` | Lista por status/empresa/pedido | data table, status chip | filled |
| A26 | NF detalhe | `/fiscal/notas/{id}` | Emitir → autorizar / cancelar (motivo) | detail card, actions, motivo dialog | rascunho, autorizada, rejeitada, cancelada |
| A27 | Pagamentos | `/financeiro/pagamentos` | Parcelas por pedido, vencidos | data table, vencimento badge, ações baixar/estornar | filled |
| A28 | Gerar parcelas | modal em A27/A12 | N parcelas, 1º vencimento, intervalo | form | default |
| A29 | Caixa | `/financeiro/caixa` | Caixa aberto: saldo, lançamentos, fechar | balance card, movements table, abrir/fechar dialogs | sem caixa aberto, aberto, fechando c/ divergência |
| A30 | Usuários | `/config/usuarios` | CRUD staff + perfil + ativo (admin only) | data table, perfil select | filled |
| A31 | Auditoria | `/auditoria` | Consulta logs: entidade, ação, antes/depois | data table, diff viewer | filled |
| A32 | Busca global | topbar de todas | Busca de produtos staff (ES) + botão reindexar (admin) | command palette / search page | filled, 503 ES off |

## 4. Fluxos de usuário

### Portal (`cliente-web`)

```
F01 Contato compra (loop central — o número a bater)
    S01 login → S02 home → S05 produto → S06 carrinho → S07 checkout → S08 confirmação
    happy path: ~6 cliques (login não conta se sessão ativa: 4)
    edge: sessão expirada no checkout (refresh silencioso → re-login),
          produto ficou sem estoque, empresa sem endereço de entrega

F02 Busca guiada
    header search (autocomplete ≥2 chars) → S04 resultados → facetas (categoria/marca/preço)
    → S05 produto
    edge: zero resultados com sugestão de termo; ES fora do ar → 503 amigável

F03 Navegação por categoria
    S02 home → mega-menu categoria→sub → S03 listagem → S05 produto

F04 Acompanhar pedido
    S09 meus pedidos → S10 detalhe (timeline de status)

F05 Autogestão
    S11 conta (ver dados/endereços) · S12 trocar senha
```

### Backoffice (`painel-administrativo`)

```
F06 Pipeline de vendas (o diferencial B2B vs. LdM)
    A05 cadastra empresa → A06 contato (+ativar portal) → A07 kanban cria oportunidade
    → A08 move lead→qualificacao→proposta→negociacao→ganha
    → A10 orçamento (itens+desconto+frete) → aprovar → converter → pedido (origem=orcamento)
    edge: orçamento expira (valido_ate), recusado c/ motivo, conversão única (1 orçamento=1 pedido)

F07 Televendas / pedido manual
    A13 novo pedido → escolhe empresa+contato+endereços → itens → criar (origem=manual)

F08 Fulfillment do pedido
    A11/A12 aguardando_pagamento → confirmado → em_separacao → faturado (A26 NF autorizada)
    → enviado → entregue → concluido     (ou cancelado — caminho válido da máquina)
    edge: transição inválida bloqueada pela máquina de estados do domínio

F09 Recebimento e caixa
    A28 gerar parcelas → A27 baixar pagamento (lança no caixa na mesma transação)
    → A29 abrir caixa → lançar suprimento/sangria → fechar (confere valor informado)
    edge: estorno exige motivo; fechar com divergência

F10 Estoque
    A21 lançar entrada → A19 saldo atualiza (projeção) → A22 abaixo do mínimo → repor
    edge: movimentação é append-only — correção = novo lançamento, nunca edição

F11 Ordem de serviço
    A23/A24 criar OS (vinculada a pedido?) → em_andamento → consumir material (baixa estoque)
    → concluida
    edge: aguardando_material; consumo sem estoque

F12 Catálogo & preço B2B
    A16 criar produto (SKU, NCM, dims) → A18 definir preço na tabela → A05 empresa ganha
    tabela → contato da empresa vê "seu" preço no portal

F13 Governança (admin)
    A30 usuários/perfis → A31 auditoria (quem mudou o quê, antes/depois) → A32 reindexar busca
```

## 5. Componentes

| Componente | Variantes | Estados | Usado em |
| --- | --- | --- | --- |
| SearchBar + autocomplete | portal (sugestões ES), staff | idle, typing, loading, vazio | S02–S05, A32 |
| MegaMenu categorias | 2 níveis (árvore do backend) | open/closed | S02–S05 |
| ProductCard | rail / grid | default, sem estoque, loading | S02–S04 |
| PriceBlock | à vista / condição B2B | normal, promocional futuro | S04, S05 |
| FacetSidebar | categoria, marca, faixa preço | checked, com contagem | S03, S04 |
| QtyStepper | decimal (unidade_medida!) | min, max estoque | S05, S06 |
| CartDrawer / página | item line, remover | filled, vazio | S06, header |
| AddressSelector | faturamento / entrega | selecionado, vazio (sem endereço) | S07 |
| StatusChip | todos os enums de status | — | S09, S10, A07–A12, A23–A26 |
| StatusStepper | pipeline do pedido | etapa atual, concluída | S10, A12 |
| DataTable | sort, filtro, paginação server-side | filled, loading, vazio | todas as listas admin |
| KanbanBoard | drag entre estágios | moving, drop inválido | A07 |
| Drawer | direita, detalhe rápido | open | A08 |
| ItemsEditor | adicionar produto, qtd, preço, desconto | linha nova, validação | A10, A13 |
| Timeline | interações / histórico OS / auditoria | — | A04, A08, A24, A31 |
| CurrencyField / DecimalInput | BRL, decimal string | foco, erro | A10, A13, A16, A18, A28, A29 |
| DocumentField | CNPJ/CPF/CEP/IE masks | erro formato | A05, A06 |
| ImageManager | upload, reorder, principal | uploading, erro | A16 |
| ConfirmDialog | ações destrutivas/irreversíveis | — | transições, cancelar NF, estorno |
| Toast | success/error/info | — | global |
| EmptyState | ícone + CTA | — | todas as listas |
| Skeleton | card, table, detail | — | loading global |
| UserMenu | conta portal / staff+perfil | — | headers |
| StatCard | KPI com trend | — | A02 |
| DiffViewer | antes/depois JSON auditoria | — | A31 |
| ErrorPage | 403/404/503 | — | S13, admin |

## 6. Modelo de dados inferido (do schema real — confiança máxima)

```
Empresa    id, razao_social, nome_fantasia, cnpj, inscricao_estadual, segmento,
           telefone, email, site, status(lead|ativo|inativo|arquivado*),
           tabela_preco_id →TabelaPreco, observacoes
           evidência: migration 0003, EmpresaReq, A04/A05 · confiança: alta

Contato    id, empresa_id→Empresa, nome, cargo, email, telefone, whatsapp,
           is_principal, acesso_portal, senha_hash (portal login)
           evidência: migration 0003, ContatoReq, auth portal · confiança: alta

Endereco   id, empresa_id, tipo(faturamento|entrega|cobranca*), logradouro,
           numero, complemento, bairro, cidade, uf, cep, pais, principal
           evidência: migration 0003, EnderecoReq · confiança: alta

Oportunidade  id, empresa_id, contato_id?, responsavel_id→Usuario, titulo,
           descricao, origem(ecommerce|indicacao|prospeccao|site|telefone|outro),
           valor_estimado, data_prevista_fechamento,
           estagio(lead→qualificacao→proposta→negociacao→ganha|perdida), motivo_perda
           evidência: migration 0003, enum EstagioOportunidade · confiança: alta

Interacao  id, empresa_id, contato_id?, oportunidade_id?, usuario_id, tipo,
           assunto, descricao, ocorrido_em, proxima_acao(+_em)  — timeline
           evidência: migration 0003, InteracaoReq · confiança: alta

Orcamento  id, numero?, empresa_id, contato_id?, oportunidade_id?, vendedor_id,
           valido_ate, desconto, frete, condicao_pagamento, observacoes,
           status(rascunho|enviado|em_analise|aprovado|recusado|expirado|convertido),
           convertido_pedido_id →Pedido (único) · itens[produto_id, descricao,
           quantidade, preco_unitario, desconto]
           evidência: migration 0003/0004, StatusOrcamento · confiança: alta

Categoria  id, categoria_pai_id→Categoria (árvore, sem auto-loop), nome,
           slug único, descricao, imagem_url, ordem, ativa
           evidência: migration 0002 · confiança: alta

Produto    id, sku único, nome, slug único, categoria_id, marca, unidade_medida,
           descricao_curta, descricao_tecnica, ncm, origem_mercadoria(char1),
           peso_kg, altura_cm, largura_cm, comprimento_cm, preco_custo,
           preco_venda, estoque_minimo, controla_estoque, ativo, destaque,
           deleted_at (soft delete) · imagens[url, alt_text, ordem, is_principal]
           evidência: migration 0002, ProdutoReq · confiança: alta

TabelaPreco  id, nome único, descricao, ativa
           · itens[produto_id, preco] (preço B2B por produto)
           evidência: migration 0002 · confiança: alta

Carrinho   id, uuid público, contato_id? | session_id (CHECK: um dos dois),
           empresa_id?, status(aberto|convertido|abandonado)
           · itens[produto_id, quantidade, preco_unitario (snapshot)]
           evidência: migration 0004 · confiança: alta

Pedido     id, numero único, empresa_id, contato_id, endereco_faturamento_id,
           endereco_entrega_id, origem(ecommerce|orcamento|manual),
           orcamento_id? (único), carrinho_id? (único), vendedor_id?,
           status(aguardando_pagamento|confirmado|em_separacao|faturado|enviado|
                  entregue|concluido|cancelado),
           subtotal, desconto, frete, total, condicao_pagamento, observacoes
           · itens[produto_id, descricao+sku snapshot, quantidade,
             preco_unitario, desconto, total]
           evidência: migration 0004, StatusPedido · confiança: alta

Pagamento  id, pedido_id, parcela_num (único por pedido), valor, vencimento,
           pago_em, status(pendente|pago|vencido|cancelado|estornado),
           forma_pagamento_id, caixa_movimentacao_id
           evidência: migration 0004 · confiança: alta

Caixa      id, status(aberto|fechado), valor_abertura, valor_informado_fechamento
           · movimentacoes[tipo(suprimento|sangria|venda|recebimento|despesa|
             estorno), valor, forma_pagamento_id, descricao] — append-only
           evidência: migration 0008, TipoCaixaMovimentacao · confiança: alta

Estoque    movimentacoes[produto_id, tipo(entrada|saida|ajuste*), quantidade,
           motivo] append-only → saldos derivados (projeção na mesma tx)
           evidência: migration 0006, README "estoque = projeção" · confiança: alta

OrdemServico  id, numero, pedido_id?, empresa_id, contato_id?, responsavel_id?,
           descricao, prioridade(baixa|normal|alta|urgente), prevista_em,
           valor_mao_obra, observacoes,
           status(aberta|em_andamento|aguardando_material|concluida|cancelada)
           · itens consumidos[produto_id, quantidade] (baixa estoque) · histórico
           evidência: migration 0005, StatusOs · confiança: alta

NotaFiscal  id, pedido_id, tipo(saida|devolucao|complementar),
           status(rascunho|autorizada|cancelada|rejeitada|denegada),
           motivo_cancelamento (gateway fiscal = stub hoje)
           evidência: migration 0007, StatusNotaFiscal · confiança: alta

Usuario    id, nome, email, senha_hash (Argon2id), perfil(admin|vendedor|
           financeiro|estoque|tecnico), ativo
           evidência: migration 0001 · confiança: alta

RefreshToken  hash SHA-256, rotação a cada uso, reuso revogado invalida sessão
           evidência: README · confiança: alta

LogAuditoria  ator, entidade, entidade_id, ação, antes/depois — append-only
           evidência: migration 0009, README · confiança: alta
```

\* valores exatos de alguns enums marcados `*` devem ser confirmados no Swagger
(`/api-docs/openapi.json`) na hora do build — schemas gerados do código.

## 7. Segurança e práticas de URL (requisito do projeto)

Regras que o wireframe já embute — vale para os dois apps:

1. **Auth por contexto**: `cliente-web` só fala `/api/v1/auth/portal/*` e
   `/api/v1/portal/*` (token `portal:`); `painel-administrativo` só fala
   `/api/v1/auth/staff/*` + backoffice (token `staff:`). Dois apps, dois
   contextos de token — o interceptor Angular de cada app nem conhece o login
   do outro.
2. **Tokens nunca na URL**: access JWT (15 min) no `Authorization` header via
   interceptor; refresh opaco em `HttpOnly Secure SameSite=Strict` cookie se o
   backend suportar, senão `sessionStorage` + rotação (reuso revogado invalida
   a sessão — backend já faz). Nunca `?token=` em rota.
3. **IDs na URL**: `Id<T>` int64 nas rotas internas; `uuid` para carrinho
   (já é o identificador público no backend). **Autorização é sempre
   server-side** — a URL nunca é a proteção (anti-IDOR: `/conta/pedidos/{id}`
   o backend valida ownership pelo `sub` do token).
4. **Slug + id** (`/p/{id}-{slug}`): padrão LdM/ML para SEO; slug é cosmético,
   o id resolve. Redirect 301 se slug divergir (canonical).
5. **Query params whitelist**: paginação/filtros/ordenação passam por
   serializer tipado (HttpParams com schema) — nada de interpolar query raw;
   `q=` sanitizado antes de ir pro ES.
6. **Route guards funcionais** (Angular): `authGuard`, `perfilGuard('admin')`,
   `portalGuard` — rota de admin nem é carregada sem token (bundle lazy
   separado por app, `painel-administrativo` pode ser deploy/host distinto).
7. **HTTP duro**: HTTPS only, `Strict-Transport-Security`, `Content-Security-
   Policy` (sem `unsafe-inline`), `X-Content-Type-Options: nosniff`,
   `Referrer-Policy: strict-origin-when-cross-origin`. CORS allowlist no
   backend (`CORS_ORIGINS` já existe no `.env.example`).
8. **Dados sensíveis fora da URL**: nada de email, CNPJ, valores em path/query;
   busca usa `q=` apenas. Canônica no `<head>` para evitar duplicata de
   parâmetros de tracking.
9. **Inputs**: CNPJ/CEP com máscara + validação de dígito client-side
   (UX) e server-side (verdade — `shared/validacao` já existe). `Dinheiro`/
   `Quantidade` trafegam como **string decimal** — o cliente nunca usa float.
10. **Auditoria**: toda ação sensível do admin já cai em `logs_auditoria`
    (append-only) — a UI de auditoria (A31) é read-only por construção.

## 8. O que não pode ser clonado (skip)

| Item | Motivo |
| --- | --- |
| Marketplace de vendedores (ML) | HWeld é single-seller B2B; sem sellers, reputação, perguntas públicas |
| Mercado Pago / gateway de pagamento online | Backend não tem gateway — `condicao_pagamento` é texto livre (faturado/boleto B2B). Se quiser Pix/cartão online, é integração nova (`replica-backend`) |
| Frete por transportadora em tempo real | `frete` é campo manual no pedido/orçamento; sem cotação de frete — cotador é integração nova |
| Emissão fiscal real (SEFAZ) | `FiscalGateway` é stub no backend; telas existem mas a autorização real depende de provider |
| Reviews/avaliações de produto | Conteúdo gerado por usuário — fora do modelo B2B atual |
| "Enviar para CEP" com ETA | Sem logística integrada; endereço de entrega vem do cadastro da empresa |
| Cupons/afiliados/black friday (LdM) | Marketing B2C — não existe no domínio (sem tabela de cupons) |
| Conteúdo textual/visual dos sites de referência | Copiar apenas padrões de UX; textos, logos, fotos são deles |

## 9. Tamanho

- **Telas**: 13 portal + 21 admin = **34**
- **Fluxos**: **13** (5 portal, 8 admin)
- **Entidades**: ~18 (modelo real, não inferência)
- **Partes difíceis**: (1) refresh-token rotation + fila de requisições no
  interceptor sem race; (2) máquinas de estado refletidas na UI (botões por
  transição válida — vir do backend ou espelhar a matriz); (3) editor de itens
  de orçamento/pedido com `Decimal` string; (4) kanban drag que respeita
  `mover_estagio` com motivo de perda; (5) degradação quando Elasticsearch
  estiver fora (503 amigável).

**Tamanho: L** (um trimestre) para os dois apps completos. A fatia vertical
mínima vale ouro: **login portal → catálogo → PDP → carrinho → checkout →
pedido confirmado** (F01) prova auth, preço por tabela, carrinho uuid e a
máquina de estados de ponta a ponta.

## 10. Próximo passo

`/replica-architect` — mapear as 94 rotas reais em contratos Angular
(services/interceptors/guards), definir a estrutura dos dois apps Angular 22
(signals, standalone, lazy routes) e a ordem do build começando pela fatia F01.

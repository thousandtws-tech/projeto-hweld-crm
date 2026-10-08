# Backend gaps — endpoints que o frontend precisa

> Spec implementável dos endpoints faltantes, mapeados no código real.
> Contexto: extrator `AuthPortal` (`crates/api/src/extratores.rs`) — resolve
> `portal.contato_id()`; a partir dele o handler busca o `Contato` e usa
> `contato.empresa_id` como **escopo de tenant** (anti-IDOR: nunca confiar em
> id vindo da URL sem checar ownership).
>
> Convenções existentes a seguir: handlers finos (HTTP↔aplicação), regra no
> use case, `Pagina<T>` para listas, `ErroApp` tipado (`nao_autenticado`,
> `proibido`, `nao_encontrado`, `conflito`, `Dominio`), anotação
> `#[utoipa::path]` + registro em `rotas.rs` e `docs.rs` (a spec OpenAPI é
> compilada — esquecer o registro quebra o build, o que é bom).

## Status por endpoint

| # | Endpoint | Tela | Repos já prontos? | Trabalho |
| --- | --- | --- | --- | --- |
| G1 | `GET /portal/me` | S11 conta | sim (`buscar_por_id` contato/empresa, `tabela_da_empresa`) | handler + use case + DTO de resposta |
| G2 | `GET /portal/enderecos` | S07 checkout, S11 | sim (`listar_por_empresa`) | handler + filtro `?tipo=` |
| G3 | `GET /portal/pedidos` | S09 meus pedidos | sim (`listar` + `FiltroPedidos{empresa_id,contato_id,status}`) | handler + use case que trava o filtro ao tenant |
| G4 | `GET /portal/pedidos/{id}` | S10 detalhe | sim (`buscar_por_id` + `buscar_itens`) | handler + checagem `pedido.empresa_id == contato.empresa_id` |
| G5 | `GET /portal/produtos/{id}` | S05 PDP | sim (`buscar_por_id`/`buscar_por_slug` + `tabela_da_empresa`) | use case montando `ItemCatalogoPortal` |
| G6 | `GET /portal/categorias` | mega-menu | sim (`listar_todas(somente_ativas)`) | handler direto |
| G7 | imagens de produto (admin) | A16 | sim (`adicionar_imagem`/`remover_imagem`/`listar_imagens`) | handlers CRUD por URL (sem upload binário) — ver §7 |

---

## G1 — `GET /portal/me`

**Propósito**: dados do contato logado + empresa + tabela de preço vigente.

```
GET /api/v1/portal/me
Auth: Bearer portal:<contato_id>
```

Use case `ServicoPortalConta::me(contato_id)`:
1. `contatos.buscar_por_id(contato_id)` → 401 se `None` ou `deleted_at` setado
   (mesmo padrão do `ServicoCheckout::executar` — contato arquivado perde acesso).
2. `empresas.buscar_por_id(contato.empresa_id)`.
3. `tabelas.tabela_da_empresa(contato.empresa_id)` → `Option`, só para devolver
   `tabela_preco_nome` (o que a empresa vê como "sua tabela").

Resposta 200 — DTO novo `MeuPerfilPortal` (não expor `senha_hash`,
`acesso_portal` raw, `deleted_at`):

```json
{
  "contato": { "id": 12, "nome": "...", "email": "...", "telefone": "...",
               "whatsapp": "...", "cargo": "...", "is_principal": true },
  "empresa": { "id": 7, "razao_social": "...", "nome_fantasia": "...",
               "cnpj": "...", "segmento": "..." },
  "tabela_preco": { "id": 3, "nome": "Distribuidor Ouro" } | null
}
```

Erros: 401 token inválido/contato arquivado.

## G2 — `GET /portal/enderecos`

**Propósito**: checkout (S07) precisa dos IDs de endereço da empresa.

```
GET /api/v1/portal/enderecos?tipo=entrega
Auth: Bearer portal:<contato_id>
Query: tipo? ∈ faturamento|entrega|... (enum TipoEndereco existente)
```

Use case: `enderecos.listar_por_empresa(contato.empresa_id, tipo)` — port
já existe e já recebe o filtro. Retorna `Vec<Endereco>` (ou `Pagina` se quiser
simetria — endereços são poucos, lista simples basta; recomendo array puro).

Resposta 200: `[{id,tipo,logradouro,numero,complemento,bairro,cidade,uf,cep,principal}]`

**Regra de negócio a confirmar**: hoje endereço só é criado via staff
(`POST /enderecos`). Se o portal deve permitir "novo endereço de entrega"
no checkout, abrir `POST /portal/enderecos` também — scope decisão de produto;
o wireframe assume lista read-only + cadastro pelo staff.

## G3 — `GET /portal/pedidos`

**Propósito**: "Meus pedidos" (S09) — lista da empresa do contato.

```
GET /api/v1/portal/pedidos?pagina=1&por_pagina=20&status=enviado
Auth: Bearer portal:<contato_id>
```

Use case `ServicoPortalPedidos::listar(contato_id, paginacao, status)`:
1. resolve contato → `empresa_id`;
2. `pedidos.listar(paginacao, FiltroPedidos { empresa_id: Some(empresa_id),
   contato_id: None, status, origem: None })`.
   - **Decisão**: `contato_id: None` lista os pedidos da **empresa inteira**
     (B2B — o comprador geralmente pode ver os pedidos da empresa). Se a
     regra for "só os meus", passar `contato_id: Some(contato_id)`. Filtrar
     pelos dois é impossível hoje (o filtro é AND) — se precisar
     "meus | da empresa", novo método ou `contato_id` opcional já serve.
     **Recomendo empresa inteira** (padrão B2B) + filtro `?so_meus=true`
     que liga o `contato_id`.

Resposta 200: `Pagina<PedidoResumoPortal>` — DTO resumido:
`{id, numero, status, origem, total, condicao_pagamento, created_at}`
(esconder `vendedor_id`, `orcamento_id`, observações internas se houver).

## G4 — `GET /portal/pedidos/{id}`

**Propósito**: detalhe do pedido (S10) com itens e timeline de status.

```
GET /api/v1/portal/pedidos/123
Auth: Bearer portal:<contato_id>
```

Use case `buscar(contato_id, pedido_id)`:
1. `pedidos.buscar_por_id(id)` → **404** (`ErroApp::nao_encontrado`) se `None`;
2. **ownership**: `pedido.empresa_id != contato.empresa_id` → **404** (não
   403 — não revelar que o pedido existe para outra empresa);
3. `pedidos.buscar_itens(pedido.id)`.

Resposta 200: `PedidoDetalhePortal` = pedido resumido + `itens[]`
(`{descricao, sku, quantidade, preco_unitario, desconto, total}` — snapshots)
+ `endereco_entrega`/`endereco_faturamento` expandidos (join ou
`enderecos.buscar_por_id` ×2 — endereços já são da empresa, ownership garantido
pelo passo 2 transitivamente, mas valide mesmo assim: `endereco.empresa_id ==
pedido.empresa_id`).

## G5 — `GET /portal/produtos/{id}` (aceitar slug)

**Propósito**: PDP (S05) com `preco_efetivo` da tabela da empresa.

```
GET /api/v1/portal/produtos/123            (id)
GET /api/v1/portal/produtos/{id}-{slug}    (opcional: mesma rota, front manda id)
```

Frontend resolve `/p/{id}-{slug}` extraindo o id; slug é cosmético (301 se
divergir — checagem no front via `produto.slug` retornado).

Use case `ServicoCatalogoPortal::produto(contato_id, id)` — **reuso**:
`ServicoCatalogoPortal::catalogo` já monta `ItemCatalogoPortal { produto,
preco_efetivo }` resolvendo tabela da empresa. Extrair o miolo
(`preco_efetivo_para(empresa_id, produto)`) e reutilizar:
1. `produtos.buscar_por_id(id)` → 404 se `None`, `!ativo` ou `deleted_at`;
2. `produtos.listar_imagens(id)` para a galeria (port já existe!);
3. `preco_efetivo` via tabela da empresa (fallback `preco_venda`).

Resposta 200: `ProdutoPortal` = `ItemCatalogoPortal` + `imagens[]` +
`estoque_disponivel: bool` (binário — não expor saldo exato no portal;
regra: `controla_estoque && saldo <= 0` → `"indisponivel"`).

## G6 — `GET /portal/categorias`

**Propósito**: mega-menu do portal — árvore de categorias ativas.

```
GET /api/v1/portal/categorias
Auth: Bearer portal:<contato_id>
```

Handler direto: `categorias.listar_todas(true)` → montar árvore
(`categoria_pai_id`) no use case ou devolver flat e montar no front
(recomendo **flat** — o front monta em O(n), cacheável por `signal`).

Resposta 200: `[{id, categoria_pai_id, nome, slug, imagem_url, ordem}]`
ordenado por `ordem`.

## G7 — Imagens de produto (admin, contexto staff)

O port `RepositorioProdutos` já tem `adicionar_imagem`/`remover_imagem`/
`listar_imagens` — **só faltam handlers**. Modelo **URL externa** (admin cola
URL de CDN/storage; upload binário é decisão posterior, fora deste gap):

```
GET    /api/v1/produtos/{id}/imagens                  → lista imagens
POST   /api/v1/produtos/{id}/imagens                  → {url, alt_text?, ordem?, is_principal?}
DELETE /api/v1/produtos/{id}/imagens/{imagem_id}      → remove
PATCH  /api/v1/produtos/{id}/imagens/{imagem_id}      → {alt_text?, ordem?, is_principal?}  (opcional — port atual não tem update; pode ser delete+post)
```

RBAC: `staff.exige(&[Perfil::Admin, Perfil::Estoque])` — mesmo perfil que
cria/edita produto. Regras: só uma `is_principal` por produto (backend zera
as demais na mesma transação — hoje `adicionar_imagem` recebe `principal:
bool`; o repo deve garantir unicidade, verificar implementação).

## Checklist de implementação (por endpoint)

- [ ] handler com `#[utoipa::path]` (tag `portal`), request/response schemas
- [ ] registro em `rotas.rs` (`.service(...)`) e em `docs.rs` (paths/schemas)
- [ ] use case em `crates/application/src/use_cases/` — resolve contato →
      empresa → escopa tudo por `empresa_id`
- [ ] **ownership 404** (não 403) quando recurso for de outra empresa
- [ ] DTOs de saída sanitizados (sem `senha_hash`, `preco_custo`,
      `estoque_minimo`, ids internos de vendedor/orçamento)
- [ ] testes: 401 sem token; 401 com token staff (contexto errado);
      404 cross-tenant; 200 happy path; paginação
- [ ] `cargo test --workspace` + `clippy -D warnings` + `fmt --check`

## Decisões pendentes (produto/backend)

1. `/portal/pedidos` — empresa inteira vs. só do contato (recomendo empresa + flag `so_meus`).
2. Endereços no portal — read-only ou CRUD (recomendo read-only v1).
3. Imagens — URL externa (v1) vs. upload multipart + storage (v2, precisa escolher provider).
4. Saldo no portal — binário `disponivel/indisponivel` (recomendo) vs. quantidade exata.

---

## Status — IMPLEMENTADO (2026-10-08)

G1–G7 entregues e verificados live contra Postgres real:

| # | Endpoint | Verificação |
| --- | --- | --- |
| G1 | `GET /portal/me` | 200 contato+empresa+tabela sanitizados; contato arquivado/revogado → 401 |
| G2 | `GET /portal/enderecos?tipo=` | 200 só endereços da empresa do token |
| G3 | `GET /portal/pedidos` | 200 paginado, escopo `empresa_id` do token; `so_meus` opcional |
| G4 | `GET /portal/pedidos/{id}` | 200 com itens+endereços; **cross-tenant → 404** (verificado com pedido de outra empresa) |
| G5 | `GET /portal/produtos/{ref}` | aceita `id`, `id-slug` ou slug; `disponivel` binário; **sem `preco_custo`/`estoque_minimo`/`deleted_at`** |
| G6 | `GET /portal/categorias` | 200 ativas flat |
| G7 | `GET/POST/DELETE /produtos/{id}/imagens` | 201/204; principal único garantido; `vendedor` → 403; imagem de outro produto → 404 |

Extras corrigidos junto (leaks encontrados durante a implementação):
- `ItemCatalogoPortal` agora faz flatten de `ProdutoPortal` sanitizado — o
  catálogo do portal **vazava `preco_custo`/`estoque_minimo`** antes.
- `POST /portal/checkout` retornava `Pedido` cru (`vendedor_id`,
  `carrinho_id`, `orcamento_id`, ids de endereço) — agora retorna
  `PedidoDetalhePortal` (itens + endereços, sem ids internos).
- `ServicoCatalogoPortal` ganhou dep `RepositorioEstoque` para `disponivel`.
- `ServicoPortal.contato()` exige `pode_logar_portal()` — revogar acesso ou
  arquivar o contato mata tokens vivos imediatamente (401).

Arquivos: `use_cases/portal.rs` (novo), `use_cases/catalogo.rs` (ProdutoPortal,
PDP, imagens), `handlers/portal.rs` (novo), `handlers/catalogo.rs` (G7),
`handlers/carrinho.rs` (checkout sanitizado), `dto.rs`, `estado.rs`,
`rotas.rs`, `docs.rs`, `main.rs`.

Quality gates: `cargo build`/`test`/`clippy -D warnings`/`fmt --check` verdes
(13 testes de domínio). Cobertura: auth 401 (sem token, staff→portal,
portal→staff), cross-tenant 404, 404 produto inativo/inexistente, RBAC 403
vendedor em imagens, principal único, happy path E2E (carrinho→checkout→
pedido na lista do portal). Pendente: testes de integração automatizados
com fixture de DB (hoje coberto por verificação live via curl).

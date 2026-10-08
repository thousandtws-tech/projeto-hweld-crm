# Componentes — HWeld design system

> Spec por componente do recon. Convenções Angular 22: standalone, `input()/
> output()` signals, template com `var(--hw-*)`, foco/keyboard via CDK a11y
> onde aplicável. Ícones: **Lucide** (MIT) — nunca ícones dos sites de
> referência. Contrast report: `tokens.json` → **25 pares, 0 falhas AA**.
>
> Nomenclatura nos apps: `hw-button`, `hw-data-table`, `hw-status-chip`…
> Estados universais de todo input/botão: `default, hover, active,
> focus-visible (2px --hw-focus-ring), disabled, loading`.

## Mapa status → chip (todos os enums do backend)

| Enum (backend) | Valor → papel |
| --- | --- |
| StatusPedido | aguardando_pagamento→warning · confirmado→info · em_separacao→progress · faturado→progress · enviado→info · entregue→success · concluido→success · cancelado→danger |
| StatusOrcamento | rascunho→neutral · enviado→info · em_analise→progress · aprovado→success · recusado→danger · expirado→neutral · convertido→success |
| EstagioOportunidade | lead→neutral · qualificacao→info · proposta→progress · negociacao→warning · ganha→success · perdida→danger |
| StatusOs | aberta→neutral · em_andamento→progress · aguardando_material→warning · concluida→success · cancelada→danger |
| PrioridadeOs | baixa→neutral · normal→info · alta→warning · urgente→danger |
| StatusNotaFiscal | rascunho→neutral · autorizada→success · rejeitada→warning · cancelada→danger · denegada→danger |
| StatusPagamento | pendente→warning · pago→success · vencido→danger · cancelado→neutral · estornado→neutral |
| StatusEmpresa / ativo | ativo→success · inativo/lead→neutral · arquivado→danger |

---

## Primitivos de formulário

### Button `hw-button`
- **variants**: primary (bg accent, text on-accent), secondary (bg surface-raised, border, text), ghost (text accent, sem fundo), danger (bg danger, text on-danger)
- **sizes**: sm 32px / md 40px / lg 48px — padding x: 12/16/20
- **states**: hover (`accent-hover`), active (scale .98), focus ring, disabled (opacidade .5 + `aria-disabled`), loading (spinner + mantém label p/ screen reader, `aria-busy`)
- **tokens**: radius md, font sm/600, motion fast
- **a11y**: `<button>` real; loading não remove o label do a11y tree
- **used on**: todas as telas

### TextField `hw-field`
- **variants**: text, email, password (toggle visibilidade), textarea, search
- **states**: + error (border danger + msg `role="alert"`), readonly
- **tokens**: border-input 1px (≥3:1 — AA), radius sm, height md 40px, label sm/500 acima
- **a11y**: `label for`, `aria-describedby` p/ erro, `aria-invalid`
- **used on**: S01, S07, S12, A05, A16, A21, A28, A29

### CurrencyField `hw-currency-field` / DecimalField `hw-decimal-field`
- **variants**: BRL (`R$` prefix), decimal (3 casas, `quantidade`)
- **states**: foco formata pt-BR, blur normaliza; **emite string decimal** — nunca float (contrato `Dinheiro`/`Quantidade`)
- **tokens**: font mono + `.hw-numeric` (tabular-nums)
- **a11y**: `inputmode="decimal"`, erro anuncia valor inválido
- **used on**: A10, A13, A16, A18, A28, A29

### DocumentField `hw-doc-field`
- **variants**: CNPJ, CPF, CEP, IE — máscara + validação de dígito client-side (UX; verdade no backend)
- **states**: erro formato inline ao blur
- **used on**: A05, A06, S11 (read-only)

### Select / Combobox `hw-select`, `hw-combobox`
- **variants**: select simples; combobox com busca (produto, empresa — server-side search via `/produtos?busca=` / `/empresas?busca=`)
- **states**: open, option selected, disabled, loading opções, empty "nenhum resultado"
- **a11y**: listbox pattern (CDK Listbox ou nativo `<select>` para ≤20 itens), setas navegam, ESC fecha
- **used on**: A05 (tabela de preço), A10/A13 (produto picker), A21, A24, S07 (condição pagamento)

### SearchBar + Autocomplete `hw-search`
- **variants**: portal (header, `GET /portal/busca/sugestoes` ≥2 chars, debounce 250ms), staff (`/busca/produtos`)
- **states**: idle, typing (sugestões dropdown), loading, vazio, **503 ES fora** → hint "busca indisponível, navegue por categorias"
- **a11y**: combobox pattern, `aria-expanded`, setas nas sugestões, Enter busca
- **used on**: header portal S02–S05, A32

### Modal `hw-modal` / Drawer `hw-drawer` / ConfirmDialog `hw-confirm`
- **variants**: modal sm/md/lg; drawer direito (560px); confirm (danger quando destrutivo)
- **states**: open (scrim --hw-scrim), closing; focus trap + `ESC` fecha; confirm exige label de ação explícito ("Cancelar NF", não "Sim")
- **a11y**: `role=dialog`, `aria-modal`, foco entra no 1º campo, retorna ao trigger
- **used on**: A05, A08 (drawer), A21, A26 (motivo cancelamento), A28, A29, confirmações globais

### Toast `hw-toast`
- **variants**: success / error / info / warning — canto inferior direito, max 3
- **states**: entrada (motion base, slide), auto-dismiss 5s (error 8s), pausa no hover
- **a11y**: `role=status` (error `role=alert`), sem ação obrigatória dentro
- **used on**: global

## Portal (`cliente-web`)

### MegaMenu `hw-mega-menu`
- **variants**: botão "Categorias" → painel 2 níveis (categoria → filhos, de `categoria_pai_id`)
- **states**: hover/focus abre (com delay ~150ms anti-flicker), mobile vira accordion fullscreen
- **a11y**: `nav` + `aria-haspopup`, fecha com ESC e foco sai, navegável por teclado
- **used on**: header S02–S05

### ProductCard `hw-product-card`
- **variants**: rail (home) / grid (listagem, mais compacto)
- **anatomia**: imagem 1:1, nome 2 linhas clamp, SKU muted mono, PriceBlock, badge destaque
- **states**: default, hover (shadow raised + translateY -2px), loading skeleton, indisponível (imagem dessaturada + chip neutral "Indisponível", CTA disabled)
- **used on**: S02, S03, S04

### PriceBlock `hw-price`
- **variants**: B2B — preço efetivo da tabela (grande, lg/700) + opcional "à vista" se negociado; sem "10x sem juros" (não há parcelamento online — decisão recon §8)
- **tokens**: font xl/700 + tabular-nums; muted p/ selo da tabela ("Tabela Distribuidor")
- **used on**: S04, S05, S06, A10 (contexto diferente: usa CurrencyField)

### FacetSidebar `hw-facets`
- **variants**: grupos checkbox Categoria/Marcas (com contagem das aggregations), range slider Preço (preco_min/max)
- **states**: collapsed por grupo (mobile), com contagem, sem resultados no grupo
- **a11y**: fieldset/legend por grupo, checkbox real
- **used on**: S03, S04

### QtyStepper `hw-qty`
- **variants**: inteiro / decimal (unidade_medida — kg, m, cx)
- **states**: min 1 (ou 0 remove no carrinho), max = estoque se `controla_estoque`, erro inline "qtd máx. X"
- **a11y**: botões `−`/`+` com `aria-label`, input numérico direto
- **used on**: S05, S06

### CartLine `hw-cart-item`
- **anatomia**: thumb 64px, nome+SKU, preço unit, QtyStepper, total linha, remover (ghost danger)
- **states**: atualizando (opacidade + spinner), removido (toast + undo 5s)
- **used on**: S06

### AddressSelector `hw-address-card`
- **variants**: faturamento / entrega — radio cards (tipo, logradouro, cidade/UF, CEP)
- **states**: selecionado (border accent 2px), vazio ("empresa sem endereço de entrega — fale com seu vendedor" + tel)
- **used on**: S07

### StatusStepper `hw-stepper`
- **variants**: horizontal (detalhe pedido) — etapas lineares até o status atual
- **states**: concluída (success), atual (accent), futura (muted), cancelado (linha interrompida + chip danger)
- **used on**: S10, A12

## Admin (`painel-administrativo`)

### DataTable `hw-data-table`
- **variants**: densa (admin default, row 40px) / confortável
- **capacidades**: sort server-side (`?pagina`, coluna order), filtros no topo (chips aplicados), paginação `Pagina<T>` (server — nunca client), seleção por linha opcional, coluna de ações (kebab menu)
- **states**: loading (skeleton rows), empty (EmptyState), error (retry)
- **a11y**: `<table>` real, `aria-sort`, headers `scope`, teclado linha a linha
- **used on**: A03, A06, A09, A11, A14 (tree), A15, A17, A19, A20, A22, A23, A25, A27, A30, A31

### KanbanBoard `hw-kanban`
- **variants**: colunas = estágios (`lead…perdida`), cards com empresa+título+valor+responsável
- **comportamento**: drag via CDK DragDrop; drop em `perdida` abre dialog **motivo_perda** (obrigatório — backend exige); drop inválido (terminal) rejeitado com toast
- **states**: dragging (ghost), drag-over coluna (highlight border accent)
- **a11y**: drag por teclado (CDK) + alternativa "mover para" no menu do card
- **used on**: A07

### ItemsEditor `hw-items-editor`
- **anatomia**: linhas [produto combobox | desc | qtd (decimal) | preço (currency) | desconto (currency) | total linha | ✕] + footer adicionar
- **comportamento**: totais recalculam local (preview) mas o **valor final é o do backend**; desconto/frete do cabeçalho abaixo da tabela
- **states**: linha nova, validação (qtd>0, preço≥0), readonly quando status ≠ rascunho
- **used on**: A10, A13

### StatusChip `hw-status-chip`
- **variants**: os 6 pares chip-* (ver mapa de status acima); tamanho único (h 24px, xs/500)
- **a11y**: cor nunca é o único sinal — sempre com label de texto
- **used on**: toda lista/detalhe com enum de status

### Timeline `hw-timeline`
- **variants**: interações CRM (tipo + assunto + data + próxima ação), histórico OS, auditoria (expandível → DiffViewer)
- **states**: vazio, loading
- **used on**: A04, A08, A24, A31

### StatCard `hw-stat`
- **anatomia**: label muted xs, valor xl/700 tabular-nums, trend opcional (↑↓ chip)
- **used on**: A02

### ImageManager `hw-image-manager`
- **anatomia**: grid thumbs ordenável (drag) + campo "adicionar URL" + radio "principal"
- **states**: imagem quebrada (placeholder), uploading se houver upload depois
- **used on**: A16 (v1: URL externa — gap G7; upload multipart é decisão posterior)

### DiffViewer `hw-diff`
- **variants**: JSON antes/depois lado a lado (admin pode ser collapsed por padrão)
- **used on**: A31

### EmptyState `hw-empty`
- **anatomia**: ícone Lucide 48px muted, título lg, descrição sm muted, CTA primary opcional
- **used on**: toda lista vazia — nunca tabela vazia sem estado

### Skeleton `hw-skeleton`
- **variants**: card, table-row, text-line — shimmer via motion base (desliga com reduced-motion)
- **used on**: loading global

### UserMenu `hw-user-menu`
- **variants**: portal (nome contato + empresa) / staff (nome + chip perfil)
- **states**: open dropdown (minha conta, trocar senha, sair)
- **used on**: headers

### ErrorPage `hw-error-page`
- **variants**: 403 sem permissão, 404, 503 busca fora — ilustração própria + CTA (voltar / contato)
- **used on**: S13, admin

## Regras transversais

- **Números sempre tabulares** (`tabular-nums`) em tabelas, preços e quantidades.
- **Cor nunca sozinha**: status = chip com texto; erro = ícone + texto.
- **Radius**: cards lg, inputs/botões sm–md, chips pill.
- **Densidade**: portal respira (cards com shadow, gap 24), admin denso (row 40px, gap 12).
- **Dark mode**: fora do MVP; tokens por papel já permitem `data-theme="dark"` futuro sem refactor.
- **A11y piso**: AA em texto, 3:1 em inputs/focus (já garantido por tokens), teclado completo em tabela/kanban/menu.

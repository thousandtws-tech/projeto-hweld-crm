# Validação — Proposta Comercial H Weld vs. entregue

Fonte: `Proposta_Comercial_H_Weld.pdf` (3 páginas, 25/09).
Escopo contratado: plataforma de e-commerce B2B + CRM integrado + rotinas de gestão.

## 1. Frente de e-commerce

| Requisito da proposta | Estado | Onde |
|---|---|---|
| Estrutura responsiva (desktop + mobile) | ✅ | `cliente-web` — breakpoints em todas as telas |
| Catálogo de produtos por categorias | ✅ | Home/catálogo com nav de categorias; mega-menu 2 níveis depende de `GET /portal/categorias` (G6) |
| Páginas de produto com infos comerciais e técnicas | ⚠️ parcial | PDP com preço B2B/UM/estoque binário; campos técnicos (NCM, dims, ficha) existem no cadastro — falta exibi-los na PDP + endpoint `GET /portal/produtos/{slug}` (G5) |
| Carrinho e registro de pedido | ✅ | Carrinho persistente + checkout → `aguardando_pagamento`; seleção de endereço depende de G2 |
| Pedido conectado à base operacional | ✅ | Mesmo domínio: `origem=ecommerce`, aparece em Pedidos no admin |

## 2. CRM e relacionamento comercial

| Requisito | Estado | Onde |
|---|---|---|
| Cadastro de empresas e contatos | ✅ | Lista/nova/edição + Empresa 360 |
| Organização de oportunidades | ✅ | Kanban 6 estágios com drag/drop + motivo de perda |
| Histórico de atendimentos e negociações | ✅ | Timeline de interações na Empresa 360 |
| Geração de orçamentos | ✅ | Editor de itens + transições válidas |
| Acompanhamento de status comercial | ✅ | Chips de status + filtros em todas as listas |
| Conversão de etapas aprovadas → pedido | ✅ | `POST /orcamentos/{id}/converter` (só `aprovado`) |

## 3. Rotinas de gestão

| Requisito | Estado | Onde |
|---|---|---|
| Controle de caixa | ✅ | Abrir/lançar/fechar com conferência + extrato |
| Pedidos de venda | ✅ | Lista, detalhe, transições, pedido manual (televendas) |
| Ordens de serviço | ✅ | Lista/detalhe, transições, consumo de material |
| Movimentação e controle de estoque | ✅ | Saldos, extrato append-only, entrada/saída/ajuste, abaixo do mínimo |
| Emissão de nota fiscal | ⚠️ stub | Emitir/autorizar/cancelar funcionais; autorização real depende das credenciais fiscais da H Weld — **a própria proposta exclui isso** ("depende da disponibilização de certificados e credenciais pela contratante") |

## 4. Integração operacional

| Requisito | Estado |
|---|---|
| Cadastros centralizados, sem duplicação manual | ✅ backend único (Rust/Postgres); e-commerce alimenta pedidos direto |
| Fluxo e-commerce → CRM → orçamento → pedido → estoque → OS | ✅ cadeia completa mapeada |

## 5. Implantação e validação

- Testes de fluxo principal: **pendente** (`/replica-test`).
- Publicação: **fora do dev** — hospedagem/domínio/BD são cobrados à parte na proposta.

## Fora de escopo (confirmado pela proposta)

- Hospedagem anual (R$ 350), domínio (R$ 40), manutenção mensal (R$ 400), servidor de BD (R$ 200) — infraestrutura separada.
- NF real depende de certificados/credenciais do cliente.
- Marketplace, cupons, reviews, frete por transportadora, gateway de pagamento — não estão na proposta e não foram construídos.

## Conclusão

**Aderente ao escopo.** Os 5 módulos propostos estão cobertos. Para estar "pronto para aceite" falta:
1. ~~Implementar os 7 endpoints do portal (G1–G7)~~ — **feito 2026-10-08**: perfil, endereços, pedidos, PDP, categorias e imagens admin live e verificados.
2. Exibir ficha técnica na PDP.
3. Rodar testes do fluxo principal com dados reais.
4. Receber certificado fiscal da H Weld para autorização de NF.

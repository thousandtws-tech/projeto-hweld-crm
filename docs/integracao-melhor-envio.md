# Integração Melhor Envio — logística (cotação de fretes)

> **Fase A implementada:** credenciais do cliente + cotação de fretes real
> (`POST /api/v2/me/shipment/calculate`). Carrinho, compra, etiqueta,
> rastreio, webhooks e cancelamento = **fase B** (precisam de
> `logistics_shipments` + carteira Melhor Envio).

## Arquitetura

Port/adapter igual ao `FiscalProvider` — nenhuma regra HWeld no adapter:

```
painel-admin ──► operations-api /api/v1/logistica/cotacoes
                     │  LogisticsService (resolver + validar + persistir)
                     ▼
              ShippingProvider (port)
              ├── MelhorEnvioProvider ──► MelhorEnvioClient ──► API ME v2
              └── StubShippingProvider (dev, sintético determinístico)
                     ▲
              LogisticsDataGateway ──► core-api
              GET /api/v1/internal/pedidos/{id}/dados-logisticos
              (itens + peso/dimensões do produto + CEP de entrega)
```

- `LOGISTICS_PROVIDER=auto` (default): Melhor Envio quando credenciado no
  banco, senão stub. `stub` força dev; `melhorenvio` força o adapter.
- Contratos neutros: `CotacaoInput`/`ProdutoCotacao`/`CotacaoServico` —
  nenhum tipo da API ME vaza para o controller ou o frontend.

## Credenciais (cliente-gerenciadas)

`integration_settings` linha `melhorenvio-frete`:

| Campo | Conteúdo |
|---|---|
| `api_key_enc` | **Bearer token** do aplicativo (AES-256-GCM, write-only) |
| `base_url` | `https://melhorenvio.com.br` (produção) ou `https://sandbox.melhorenvio.com.br` |
| `external_id` | id da conta (`GET /api/v2/me` no "Testar conexão") |
| `nome_conta` | rótulo/nome da conta |
| `envio_pausado` | pausa local de cotações |
| `config.cep_origem` | CEP de coleta da empresa (obrigatório p/ cotar) |
| `config.servicos` | CSV de service ids permitidos (vazio = todos) |

**Contas sandbox e produção são separadas** no Melhor Envio — o token de um
ambiente não funciona no outro. Token gerado em: painel ME → Integrações →
aplicativo → "Gerar token". Header `User-Agent` fixo (exigido pela API):
`LOGISTICS_USER_AGENT`.

## Endpoints

| Método | Rota | Função |
|---|---|---|
| GET/PUT | `/api/v1/integracoes/melhorenvio` | view/salvar (admin, token write-only) |
| POST | `/api/v1/integracoes/melhorenvio/habilitacao` | liga/desliga |
| POST | `/api/v1/integracoes/melhorenvio/testar-conexao` | `GET /me` — valida token + resolve conta |
| POST | `/api/v1/logistica/cotacoes?pedido_id=` | cota pelos dados do pedido |
| POST | `/api/v1/logistica/cotacoes` | manual: `{cepDestino, produtos[]}` |
| GET | `/api/v1/logistica/cotacoes?limite=` | histórico |
| GET | `/api/v1/internal/pedidos/{id}/dados-logisticos` | core-api (`X-Service-Token`) |

## Cotação

- **Por pedido:** produtos montados do cadastro (peso kg, cm, valor
  unitário p/ seguro); destino = `endereco_entrega_id` do pedido. Itens
  sem dimensões são listados e a cotação segue com os demais (log warn).
- **Manual:** `cep_destino` + `produtos[]` `{id, width, height, length,
  weight, insurance_value, quantity}` — unidades cm/kg/BRL (oficial).
- Resposta ME `{serviceId: {…}}` → `CotacaoServico[]`: prefere
  `custom_price`/`custom_delivery_time` (taxas da conta), entradas com
  `error` voltam isoladas (UI mostra por serviço), ordenação
  disponíveis→menor preço.
- Cada cotação persiste em `logistics_quotes` (request/response/erro) —
  auditoria e base da fase B.

## Erros

`ShippingProviderException` tipada: `validacao` (400/422), `autenticacao`
(401/403 — token errado ou de outro ambiente), `rate_limit` (429 +
Retry-After), `provedor_indisponivel` (5xx), `transporte` (timeout — cotação
é leitura, sempre retriável). `mapearErro` do `LogisticsService` traduz para
`ApiException` (403/502/400) sem vazar token.

## Checklist operacional

1. Cliente gera token no aplicativo ME (sandbox primeiro).
2. Integrações → Melhor Envio → Configurações: ambiente, token, CEP origem → Salvar.
3. "Testar conexão" deve devolver conta acessível.
4. Visão geral → "Cotações habilitadas" ON.
5. Aba Cotação → cotar por pedido (precisa de produtos com
   peso/altura/largura/comprimento cadastrados).

## Referências oficiais

- docs.melhorenvio.com.br — autenticação (Bearer, 30d), User-Agent
  obrigatório, `POST /api/v2/me/shipment/calculate` (products), `GET /me`,
  `GET /me/balance`. `custom_price`/`custom_delivery_time` = preço com as
  taxas configuradas na conta.

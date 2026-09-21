# HWeld Web — Next.js + GraphQL BFF

Frontend do HWeld CRM/portal B2B. O browser fala **somente GraphQL** com um BFF
embutido no Next (`POST /api/graphql`); o BFF delega ao backend REST Actix
propagando o `Authorization: Bearer` do caller — o server REST continua sendo a
fonte da verdade.

```
React (Apollo Client) ──GraphQL──▶ /api/graphql (graphql-yoga)
                                      │ resolvers tipados (codegen)
                                      ▼
                              REST gateway (fetch, timeout, erros)
                                      │ Bearer forward
                                      ▼
                              Actix /api/v1 (staff + portal)
```

### Estrutura

| Caminho | Papel |
| --- | --- |
| `src/server/graphql/schema/*.graphql` | SDL por domínio (auth, crm, catálogo, vendas, ordens, financeiro, portal) |
| `src/server/graphql/resolvers/` | Resolvers — delegam ao gateway, sem lógica de negócio |
| `src/server/graphql/bridge.ts` | Ponte camelCase↔snake_case + coerção de IDs |
| `src/server/graphql/context.ts` | Contexto por request: Bearer token + `api` |
| `src/server/rest/` | Gateway REST tipado (espelho das rotas Actix) |
| `src/graphql/operations/` | Documentos `.graphql` consumidos pelo cliente |
| `src/graphql/generated/` + `src/server/graphql/generated/` | Tipos gerados (não editar) |
| `src/lib/apollo-client.ts` | Apollo: auth link + refresh single-flight em 401 |
| `src/hooks/` | `useAuth`, `usePortal`, `useUsuarios` (GraphQL) |

### Comandos

```bash
npm run codegen   # regenera tipos após mudar schema ou operations
npm run build     # build de produção (inclui validação TS)
npm run lint      # eslint flat config
```

Variáveis de ambiente: ver `.env.example`. Em dev, GraphiQL disponível em
`/api/graphql`; em produção erros são mascarados.

---

# Free eCommerce Template for Next.js - NextMerce

The free Next.js eCommerce template is a lite version of the NextMerce Next.js eCommerce boilerplate, designed to streamline the launch and management of your online store.

![NextMerce](https://github.com/user-attachments/assets/57155689-a756-4222-8af7-134e556acae2)


While NextMerce Pro features advanced functionalities, seamless integration, and customizable options, providing all the essential tools needed to build and expand your business, the lite version offers a basic Next.js template specifically crafted for eCommerce websites. Both versions ensure superior performance and flexibility, all powered by Next.js.

### NextMerce Free VS NextMerce Pro

| ✨ Features                         | 🎁 NextMerce Free                 | 🔥 NextMerce Pro                        |
|----------------------------------|--------------------------------|--------------------------------------|
| Next.js Pages                    | Static                         | Dynamic Boilerplate Template         |
| Components                       | Limited                        | All According to Demo                |
| eCommerce Functionality          | Included                       | Included                             |
| Integrations (DB, Auth, etc.)    | Not Included                   | Included                             |
| Community Support                | Included                       | Included                             |
| Premium Email Support            | Not Included                   | Included                             |
| Lifetime Free Updates            | Included                       | Included                             |


#### [🚀 Live Demo](https://demo.nextmerce.com/)

#### [🌐 Visit Website](https://nextmerce.com/)

## Update Logs

Version 0.1.2 - [Mar 16, 2026]
- Update Next.js, React, and React DOM dependencies, add baseline-browser-mapping
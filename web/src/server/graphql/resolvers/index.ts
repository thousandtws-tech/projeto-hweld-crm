import { mergeResolvers } from "@graphql-tools/merge";

import { scalars } from "@/server/graphql/scalars";
import { authResolvers } from "@/server/graphql/resolvers/auth";
import { catalogoResolvers } from "@/server/graphql/resolvers/catalogo";
import { crmResolvers } from "@/server/graphql/resolvers/crm";
import { financeiroResolvers } from "@/server/graphql/resolvers/financeiro";
import { ordensResolvers } from "@/server/graphql/resolvers/ordens";
import { portalResolvers } from "@/server/graphql/resolvers/portal";
import { usuariosResolvers } from "@/server/graphql/resolvers/usuarios";
import { vendasResolvers } from "@/server/graphql/resolvers/vendas";

export const resolvers = mergeResolvers([
  scalars,
  authResolvers,
  usuariosResolvers,
  crmResolvers,
  catalogoResolvers,
  vendasResolvers,
  ordensResolvers,
  financeiroResolvers,
  portalResolvers,
]);

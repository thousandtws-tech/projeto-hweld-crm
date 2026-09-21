/**
 * Montagem do schema: lê os `.graphql` do diretório `schema/` (SDL por
 * módulo), instala resolvers tipados (codegen) e aplica a ponte de nomes
 * camelCase↔snake_case em todos os campos de objeto.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { createSchema } from "graphql-yoga";

import { withRestBridge } from "@/server/graphql/bridge";
import { resolvers } from "@/server/graphql/resolvers";
import type { GraphQLContext } from "@/server/graphql/context";

const BASE_SDL = /* GraphQL */ `
  type Query
  type Mutation
`;

function loadTypeDefs(): string {
  const dir = path.join(process.cwd(), "src/server/graphql/schema");
  const parts = readdirSync(dir)
    .filter((f) => f.endsWith(".graphql"))
    .sort()
    .map((f) => readFileSync(path.join(dir, f), "utf8"));
  return [BASE_SDL, ...parts].join("\n");
}

const raw = createSchema<GraphQLContext>({
  typeDefs: loadTypeDefs(),
  resolvers,
});

export const schema = withRestBridge(raw);

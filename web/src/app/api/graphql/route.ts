/**
 * BFF GraphQL — `POST /api/graphql`.
 * Frontend fala somente GraphQL; resolvers delegam ao REST do backend
 * propagando o Bearer token do caller. GraphiQL disponível fora de produção.
 */
import { createYoga } from "graphql-yoga";
import type { NextRequest } from "next/server";

import { buildContext, type GraphQLContext } from "@/server/graphql/context";
import { schema } from "@/server/graphql/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const { handleRequest } = createYoga<GraphQLContext>({
  schema,
  graphqlEndpoint: "/api/graphql",
  graphiql: process.env.NODE_ENV !== "production",
  context: ({ request }) => buildContext(request),
  maskedErrors: process.env.NODE_ENV === "production",
});

type RouteContext = { params: Promise<Record<string, never>> };

function handle(request: NextRequest, ctx: RouteContext) {
  // O server context do Next não é usado — o contexto GraphQL vem do request.
  return handleRequest(request, ctx as never);
}

export { handle as GET, handle as POST };

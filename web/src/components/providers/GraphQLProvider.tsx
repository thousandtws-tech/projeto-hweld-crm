"use client";

import { ApolloProvider } from "@apollo/client/react";
import type { ReactNode } from "react";

import { getApolloClient } from "@/lib/apollo-client";

export function GraphQLProvider({ children }: { children: ReactNode }) {
  return <ApolloProvider client={getApolloClient()}>{children}</ApolloProvider>;
}

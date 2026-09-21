/**
 * Apollo Client (browser) — aponta para o BFF `POST /api/graphql`.
 *
 * - `authLink`: injeta `Authorization: Bearer <access_token>` por request.
 * - `errorLink`: em 401/`NAO_AUTENTICADO`, tenta `refreshSession` uma vez
 *   (single-flight), persiste o novo par de tokens e repete a operação.
 *   Se o refresh falhar, a sessão é limpa e o erro propaga para o caller.
 */
import { ApolloClient, from, HttpLink, InMemoryCache } from "@apollo/client";
import { CombinedGraphQLErrors } from "@apollo/client/errors";
import { SetContextLink } from "@apollo/client/link/context";
import { ErrorLink } from "@apollo/client/link/error";
import { from as fromPromise, switchMap, throwError } from "rxjs";

import { clearTokens, getTokens, setTokens } from "@/lib/auth-tokens";

const GRAPHQL_ENDPOINT = "/api/graphql";

const REFRESH_SESSION = /* GraphQL */ `
  mutation RefreshSession($refreshToken: String!) {
    refreshSession(refreshToken: $refreshToken) {
      accessToken
      refreshToken
    }
  }
`;

/** Chamada crua ao BFF — fora do Apollo para não criar loop no error link. */
async function requestNewTokens(refreshToken: string): Promise<boolean> {
  try {
    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: REFRESH_SESSION,
        variables: { refreshToken },
      }),
    });
    const payload = (await response.json()) as {
      data?: { refreshSession?: { accessToken: string; refreshToken: string } };
    };
    const tokens = payload.data?.refreshSession;
    if (!tokens) {
      clearTokens();
      return false;
    }
    setTokens(tokens.accessToken, tokens.refreshToken);
    return true;
  } catch {
    return false;
  }
}

let inflightRefresh: Promise<boolean> | null = null;

/** Refresh single-flight: requests concorrentes dividem a mesma chamada. */
function refreshSession(): Promise<boolean> {
  inflightRefresh ??= requestNewTokens(getTokens().refresh ?? "").finally(
    () => {
      inflightRefresh = null;
    },
  );
  return inflightRefresh;
}

function isUnauthenticated(error: unknown): boolean {
  if (CombinedGraphQLErrors.is(error)) {
    return error.errors.some(
      (e) =>
        e.extensions?.code === "NAO_AUTENTICADO" ||
        e.extensions?.httpStatus === 401,
    );
  }
  return false;
}

const authLink = new SetContextLink(({ headers }) => {
  const { access } = getTokens();
  return {
    headers: {
      ...headers,
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
    },
  };
});

const errorLink = new ErrorLink(({ error, operation, forward }) => {
  const context = operation.getContext() as { authRetried?: boolean };
  if (!isUnauthenticated(error) || context.authRetried || !getTokens().refresh) {
    return;
  }
  return fromPromise(refreshSession()).pipe(
    switchMap((refreshed) => {
      if (!refreshed) return throwError(() => error);
      operation.setContext({ authRetried: true });
      return forward(operation);
    }),
  );
});

const httpLink = new HttpLink({ uri: GRAPHQL_ENDPOINT });

export function createApolloClient() {
  return new ApolloClient({
    link: from([authLink, errorLink, httpLink]),
    cache: new InMemoryCache(),
    defaultOptions: {
      // BFF é a fronteira de dados frescos — evita cache staleness em listas.
      watchQuery: { fetchPolicy: "cache-and-network" },
      query: { fetchPolicy: "cache-first" },
    },
  });
}

let browserClient: ApolloClient | null = null;

/** Singleton no browser (o endpoint é same-origin; não há uso em RSC). */
export function getApolloClient() {
  browserClient ??= createApolloClient();
  return browserClient;
}

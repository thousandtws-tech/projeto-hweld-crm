/**
 * Ponte entre o contrato GraphQL (camelCase) e o payload REST (snake_case).
 *
 * Saída: `mapSchema` instala em todo campo de objeto sem resolver explícito
 * um resolver que procura `source[field]` e `source[snake_case(field)]`.
 * Assim os resolvers de Query/Mutation devolvem o JSON cru da API e cada
 * campo é projetado sem mapeamento manual por tipo.
 *
 * Entrada: `toRestInput` converte args/input camelCase → snake_case e
 * coage campos `*_id`/`id` de string (ID GraphQL) para número (i64).
 */
import { defaultFieldResolver } from "graphql";
import { mapSchema, MapperKind } from "@graphql-tools/utils";

const snakeCase = (s: string) =>
  s.replace(/([A-Z])/g, (m) => `_${m.toLowerCase()}`);

const bridgeFieldNames = (fieldConfig: {
  resolve?: unknown;
}): typeof fieldConfig => {
  if (fieldConfig.resolve) return fieldConfig; // resolver explícito vence
  return {
    ...fieldConfig,
    resolve: (source, args, context, info) => {
      if (source != null && typeof source === "object") {
        const record = source as Record<string, unknown>;
        const name = info.fieldName;
        if (name in record) return record[name];
        const snake = snakeCase(name);
        if (snake in record) return record[snake];
      }
      return defaultFieldResolver(source, args, context, info);
    },
  };
};

export function withRestBridge<T>(schema: T): T {
  return mapSchema(schema as never, {
    [MapperKind.OBJECT_FIELD]: bridgeFieldNames as never,
  }) as T;
}

const isNumericId = (key: string, value: unknown): value is string =>
  (key === "id" || key.endsWith("_id")) &&
  typeof value === "string" &&
  /^\d+$/.test(value);

/** camelCase → snake_case profundo + coerção de IDs para o contrato REST. */
export function toRestInput(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toRestInput);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value)) {
      if (raw === undefined) continue;
      const snake = snakeCase(key);
      out[snake] = toRestInput(isNumericId(snake, raw) ? Number(raw) : raw);
    }
    return out;
  }
  return value;
}

/** Alias semântico para argumentos de query (paginação/filtros). */
export const toRestQuery = toRestInput;

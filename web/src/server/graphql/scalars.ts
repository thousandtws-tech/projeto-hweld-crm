/**
 * Escalares customizados — o backend serializa Decimal/Date/DateTime/UUID
 * como string; JSON é opaco (auditoria/facetas dinâmicas).
 */
import { GraphQLScalarType, Kind } from "graphql";
import { valueFromASTUntyped } from "graphql/utilities";

const stringScalar = (name: string, description: string) =>
  new GraphQLScalarType({
    name,
    description,
    serialize: (v) => String(v),
    parseValue: (v) => String(v),
    parseLiteral: (ast) =>
      ast.kind === Kind.STRING || ast.kind === Kind.INT || ast.kind === Kind.FLOAT
        ? String(ast.value)
        : null,
  });

export const scalars = {
  Decimal: stringScalar(
    "Decimal",
    "Decimal arbitrário serializado como string (ex: \"1234.56\").",
  ),
  Date: stringScalar("Date", "Data ISO sem hora (YYYY-MM-DD)."),
  DateTime: stringScalar("DateTime", "Timestamp ISO 8601 (UTC)."),
  UUID: stringScalar("UUID", "Identificador UUID v4."),
  JSON: new GraphQLScalarType({
    name: "JSON",
    description: "JSON arbitrário (pass-through).",
    serialize: (v) => v,
    parseValue: (v) => v,
    parseLiteral: (ast, variables) => valueFromASTUntyped(ast, variables),
  }),
};

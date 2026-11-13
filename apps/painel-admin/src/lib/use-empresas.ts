import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { Empresa } from "@/lib/models";

/**
 * Mapa `empresa_id → nome` compartilhado — o nome da empresa não vem no
 * payload das listas (pedidos, orçamentos, OS, notas), então todas as
 * páginas resolviam fazendo `por_pagina: 100` por conta própria. Aqui vira
 * uma query cacheada e coalescida: dez páginas abertas = uma requisição.
 *
 * Limitação conhecida: acima de `por_pagina: 500` empresas, nomes fora da
 * primeira página aparecem como "Empresa #id" — join real no backend
 * (`empresa_nome` nas listas) é o caminho definitivo.
 */
export function useEmpresasMap(): Map<number, Empresa> {
  const { data } = useQuery({
    queryKey: ["lookup", "empresas"],
    queryFn: () =>
      api
        .lista<Empresa>("empresas", { por_pagina: 500 })
        .catch(() => ({ itens: [] as Empresa[] })),
    staleTime: 60_000,
  });
  return new Map((data?.itens ?? []).map((e) => [e.id, e]));
}

/** Atalho quando a página só precisa do nome (não do objeto inteiro). */
export function useEmpresasNomes(): Map<number, string> {
  const mapa = useEmpresasMap();
  const nomes = new Map<number, string>();
  mapa.forEach((e, id) => nomes.set(id, e.nome_fantasia || e.razao_social));
  return nomes;
}

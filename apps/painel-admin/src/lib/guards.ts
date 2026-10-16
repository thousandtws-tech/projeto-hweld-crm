import { redirect } from "@tanstack/react-router";

import type { Perfil } from "./models";
import { pode } from "./session";

/** RBAC por perfil — `beforeLoad` das rotas restritas. */
export function exigePerfil(...perfis: Perfil[]) {
  return () => {
    if (!pode(...perfis)) throw redirect({ to: "/sem-permissao" });
  };
}

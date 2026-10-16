import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/layout/AppShell";
import { ListaPage } from "@/components/lista";

export const Route = createFileRoute("/crm/empresas/")({
  component: () => (
    <AppShell>
      <ListaPage
        cfg={{
          titulo: "Empresas",
          recurso: "empresas",
          busca: true,
          colunas: [
            { campo: "id", rotulo: "#", link: "/crm/empresas" },
            { campo: "razao_social", rotulo: "Razão social" },
            { campo: "nome_fantasia", rotulo: "Nome fantasia" },
            { campo: "cnpj", rotulo: "CNPJ" },
            { campo: "segmento", rotulo: "Segmento" },
            { campo: "status", rotulo: "Status", tipo: "status" },
          ],
          novaRota: "/crm/empresas/nova",
          detalhePrefixo: "/crm/empresas",
          eventos: ["empresa.criada", "empresa.atualizada", "empresa.arquivada"],
        }}
      />
    </AppShell>
  ),
});

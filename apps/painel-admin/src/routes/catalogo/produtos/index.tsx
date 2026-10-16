import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/layout/AppShell";
import { ListaPage } from "@/components/lista";
import { exigePerfil } from "@/lib/guards";

export const Route = createFileRoute("/catalogo/produtos/")({
  beforeLoad: exigePerfil("admin", "estoque", "vendedor"),
  component: () => (
    <AppShell>
      <ListaPage
        cfg={{
          titulo: "Produtos",
          recurso: "produtos",
          busca: true,
          colunas: [
            { campo: "sku", rotulo: "SKU", link: "/catalogo/produtos" },
            { campo: "nome", rotulo: "Nome" },
            { campo: "marca", rotulo: "Marca" },
            { campo: "unidade_medida", rotulo: "UM" },
            { campo: "preco_venda", rotulo: "Preço", tipo: "dinheiro" },
            { campo: "ativo", rotulo: "Ativo", tipo: "bool" },
          ],
          filtro: {
            campo: "ativo",
            rotulo: "Ativo",
            opcoes: [
              { valor: "true", rotulo: "Sim" },
              { valor: "false", rotulo: "Não" },
            ],
          },
          novaRota: "/catalogo/produtos/novo",
          detalhePrefixo: "/catalogo/produtos",
          eventos: ["catalogo.produtos", "estoque.movimentado"],
          excluir: { rotulo: "Excluir", campoNome: "nome" },
        }}
      />
    </AppShell>
  ),
});

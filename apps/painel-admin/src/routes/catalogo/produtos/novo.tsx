import { createFileRoute } from "@tanstack/react-router";

import { ProdutoForm } from "@/components/ProdutoForm";
import { exigePerfil } from "@/lib/guards";

export const Route = createFileRoute("/catalogo/produtos/novo")({
  beforeLoad: exigePerfil("admin", "estoque", "vendedor"),
  component: () => <ProdutoForm />,
});

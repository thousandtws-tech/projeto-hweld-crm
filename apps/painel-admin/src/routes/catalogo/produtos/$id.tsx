import { createFileRoute } from "@tanstack/react-router";

import { ProdutoForm } from "@/components/ProdutoForm";
import { exigePerfil } from "@/lib/guards";

export const Route = createFileRoute("/catalogo/produtos/$id")({
  beforeLoad: exigePerfil("admin", "estoque", "vendedor"),
  component: function ProdutoEdicao() {
    const { id } = Route.useParams();
    // Aceita public_id (UUID) ou id numérico legado — o ProdutoForm resolve e
    // reescreve a URL para o public_id (canonicalização).
    return <ProdutoForm produtoRef={id} />;
  },
});

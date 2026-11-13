import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader, SectionCard, StatusPill } from "@/components/ui-kit/primitives";
import { FormDialog, FormField, fieldClass } from "@/components/ui-kit/FormDialog";
import type { Usuario } from "@/lib/models";
import { usuariosService } from "@/lib/services";
import { exigePerfil } from "@/lib/guards";
import { useResourceList } from "@/lib/use-resource-list";

export const Route = createFileRoute("/admin/usuarios")({
  beforeLoad: exigePerfil("admin"),
  component: UsuariosPage,
});

/** Usuários staff — CRUD + ativo (admin only). */
function UsuariosPage() {
  const l = useResourceList<Usuario>({
    recurso: "usuarios",
    eventos: (t) => t.startsWith("usuario."),
  });
  const usuarios = l.itens;
  const carregar = l.recarregar;
  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [f, setF] = useState({ nome: "", email: "", senha: "", perfil: "vendedor" });

  const abrir = (u?: Usuario) => {
    setEditando(u ?? null);
    setF({
      nome: u?.nome ?? "",
      email: u?.email ?? "",
      senha: "",
      perfil: u?.perfil ?? "vendedor",
    });
    setOpen(true);
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.nome.trim() || !f.email.trim() || (!editando && f.senha.length < 6)) return;
    try {
      if (editando) {
        await usuariosService.atualizar(editando.id, {
          nome: f.nome,
          email: f.email,
          perfil: f.perfil,
        });
      } else {
        await usuariosService.criar({
          nome: f.nome,
          email: f.email,
          senha: f.senha,
          perfil: f.perfil,
        });
      }
      setOpen(false);
      carregar();
      toast.success("Usuário salvo.");
    } catch {
      toast.error("Falha ao salvar usuário.");
    }
  };

  const alternarAtivo = async (u: Usuario) => {
    try {
      await usuariosService.definirAtivo(u.id, !u.ativo);
      carregar();
    } catch {
      toast.error("Falha ao alterar status.");
    }
  };

  return (
    <>
      <PageHeader
        title="Usuários"
        action={
          <button
            onClick={() => abrir()}
            className="rounded-full bg-lime px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            + Usuário
          </button>
        }
      />

      <SectionCard className="p-0 overflow-hidden">
        <table className={`w-full text-sm ${l.carregando ? "opacity-55" : ""}`}>
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              {["Nome", "E-mail", "Perfil", "Ativo", ""].map((h) => (
                <th key={h} className="px-4 py-3 font-semibold last:text-right">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {usuarios.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  Nenhum usuário.
                </td>
              </tr>
            )}
            {usuarios.map((u) => (
              <tr key={u.id} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-3 font-medium">{u.nome}</td>
                <td className="px-4 py-3">{u.email}</td>
                <td className="px-4 py-3">
                  <StatusPill status="draft" label={u.perfil} />
                </td>
                <td className="px-4 py-3">
                  <StatusPill
                    status={u.ativo ? "ativo" : "inativo"}
                    label={u.ativo ? "Sim" : "Não"}
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => abrir(u)}
                    className="mr-2 rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-secondary"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => void alternarAtivo(u)}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      u.ativo
                        ? "border border-destructive/30 text-destructive hover:bg-destructive/10"
                        : "bg-lime text-primary-foreground hover:opacity-90"
                    }`}
                  >
                    {u.ativo ? "Desativar" : "Ativar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {l.pagina && l.pagina.total_paginas > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <span className="text-xs text-muted-foreground">{l.pagina.total} registro(s)</span>
            <div className="flex items-center gap-1">
              {Array.from({ length: l.pagina.total_paginas }, (_, i) => i + 1)
                .slice(
                  Math.max(0, Math.min(l.paginaNum - 3, l.pagina.total_paginas - 5)),
                  Math.max(5, Math.min(l.paginaNum + 2, l.pagina.total_paginas)),
                )
                .map((p) => (
                  <button
                    key={p}
                    onClick={() => l.setPaginaNum(p)}
                    className={`h-8 min-w-8 rounded-xl px-2 text-xs font-semibold ${
                      p === l.paginaNum
                        ? "bg-lime text-primary-foreground"
                        : "text-muted-foreground hover:bg-secondary"
                    }`}
                  >
                    {p}
                  </button>
                ))}
            </div>
          </div>
        )}
      </SectionCard>

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={editando ? "Editar usuário" : "Novo usuário"}
        description="Conta de acesso ao painel"
        submitLabel="Salvar"
        onSubmit={salvar}
      >
        <FormField label="Nome">
          <input
            className={fieldClass}
            required
            value={f.nome}
            onChange={(e) => setF({ ...f, nome: e.target.value })}
          />
        </FormField>
        <FormField label="E-mail">
          <input
            className={fieldClass}
            type="email"
            required
            value={f.email}
            onChange={(e) => setF({ ...f, email: e.target.value })}
          />
        </FormField>
        {!editando && (
          <FormField label="Senha">
            <input
              className={fieldClass}
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={f.senha}
              onChange={(e) => setF({ ...f, senha: e.target.value })}
            />
          </FormField>
        )}
        <FormField label="Perfil">
          <select
            className={fieldClass}
            value={f.perfil}
            onChange={(e) => setF({ ...f, perfil: e.target.value })}
          >
            <option value="admin">Admin</option>
            <option value="vendedor">Vendedor</option>
            <option value="financeiro">Financeiro</option>
            <option value="estoque">Estoque</option>
            <option value="tecnico">Técnico</option>
          </select>
        </FormField>
      </FormDialog>
    </>
  );
}

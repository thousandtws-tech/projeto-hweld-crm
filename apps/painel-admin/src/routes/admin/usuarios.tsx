import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "@/components/ui/sonner";

import { PageHeader, SectionCard, StatusPill } from "@/components/ui-kit/primitives";
import { FormDialog, FormField, fieldClass } from "@/components/ui-kit/FormDialog";
import type { Usuario } from "@/lib/models";
import { usuariosService } from "@/lib/services";
import { exigePerfil } from "@/lib/guards";
import { useResourceList } from "@/lib/use-resource-list";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";

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
          <Button variant="contained" onClick={() => abrir()}>+ Usuário</Button>
        }
      />

      <SectionCard className="p-0 overflow-hidden">
        <Table size="small" className={`w-full text-sm ${l.carregando ? "opacity-55" : ""}`}>
          <TableHead>
            <TableRow >
              {["Nome", "E-mail", "Perfil", "Ativo", ""].map((h) => (
                <TableCell align="right" key={h}>
                  {h}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {usuarios.length === 0 && (
              <TableRow >
                <TableCell align="center" colSpan={5}>
                  Nenhum usuário.
                </TableCell>
              </TableRow>
            )}
            {usuarios.map((u) => (
              <TableRow key={u.id}>
                <TableCell >{u.nome}</TableCell>
                <TableCell >{u.email}</TableCell>
                <TableCell >
                  <StatusPill status="draft" label={u.perfil} />
                </TableCell>
                <TableCell >
                  <StatusPill
                    status={u.ativo ? "ativo" : "inativo"}
                    label={u.ativo ? "Sim" : "Não"}
                  />
                </TableCell>
                <TableCell align="right">
                  <Button variant="outlined" size="small" onClick={() => abrir(u)}>Editar</Button>
                  <Chip label={<>{u.ativo ? "Desativar" : "Ativar"}</>} size="small" variant={(u.ativo) ? "filled" : "outlined"} color={(u.ativo) ? "primary" : "default"} onClick={() => void alternarAtivo(u)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

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
                  <Chip label={<>{p}</>} size="small" variant={(p === l.paginaNum) ? "filled" : "outlined"} color={(p === l.paginaNum) ? "primary" : "default"} key={p} onClick={() => l.setPaginaNum(p)} />
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
          <TextField size="small" fullWidth
            required
            value={f.nome}
            onChange={(e) => setF({ ...f, nome: e.target.value })} />
        </FormField>
        <FormField label="E-mail">
          <TextField size="small" fullWidth
            type="email"
            required
            value={f.email}
            onChange={(e) => setF({ ...f, email: e.target.value })} />
        </FormField>
        {!editando && (
          <FormField label="Senha">
            <TextField size="small" fullWidth slotProps={{ htmlInput: { minLength: 6 } }}
              type="password"
              required
             
              autoComplete="new-password"
              value={f.senha}
              onChange={(e) => setF({ ...f, senha: e.target.value })} />
          </FormField>
        )}
        <FormField label="Perfil">
          <TextField size="small" fullWidth select
            value={f.perfil}
            onChange={(e) => setF({ ...f, perfil: e.target.value })}>
            <MenuItem value="admin">Admin</MenuItem>
            <MenuItem value="vendedor">Vendedor</MenuItem>
            <MenuItem value="financeiro">Financeiro</MenuItem>
            <MenuItem value="estoque">Estoque</MenuItem>
            <MenuItem value="tecnico">Técnico</MenuItem>
          </TextField>
        </FormField>
      </FormDialog>
    </>
  );
}

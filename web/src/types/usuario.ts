export type PerfilUsuario = "admin" | "vendedor" | "financeiro" | "estoque" | "tecnico";

export interface Usuario {
  id: number;
  nome: string;
  email: string;
  perfil: PerfilUsuario;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Paginacao<T> {
  itens: T[];
  pagina: number;
  por_pagina: number;
  total: number;
  total_paginas: number;
}

export interface ListarUsuariosFiltros {
  pagina?: number;
  por_pagina?: number;
  perfil?: PerfilUsuario;
  ativo?: boolean;
  busca?: string;
}

export interface CriarUsuarioRequest {
  nome: string;
  email: string;
  perfil: PerfilUsuario;
  senha: string;
}

export interface AtualizarUsuarioRequest {
  nome?: string;
  email?: string;
  perfil?: PerfilUsuario | null;
}

export interface AtivarUsuarioRequest {
  ativo: boolean;
}

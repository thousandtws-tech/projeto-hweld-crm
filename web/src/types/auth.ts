export interface LoginCredentials {
  email: string;
  senha: string;
}

interface TokenResponse {
  access_expira_em: number;
  access_token: string;
  refresh_expira_em: number;
  refresh_token: string;
  token_type: string;
}

export interface LoginStaffResponse extends TokenResponse {}

export interface PortalContato {
  empresa_id: number;
  id: number;
  nome: string;
}

export interface LoginPortalResponse extends TokenResponse {
  contato: PortalContato;
}

export type LoginResponse = LoginStaffResponse | LoginPortalResponse;

export interface RefreshRequest {
  refresh_token: string;
}

export interface RefreshResponse {
  access_expira_em: number;
  access_token: string;
  refresh_expira_em: number;
  refresh_token: string;
  token_type: string;
}

export interface LogoutRequest {
  refresh_token: string;
}

export interface ChangePasswordRequest {
  senha_atual: string;
  nova_senha: string;
}

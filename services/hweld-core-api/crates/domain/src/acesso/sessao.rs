//! Sessão autenticada — identidade de dispositivo para "suas sessões".
//! `Dispositivo` é um value object puro derivado do User-Agent (woothee);
//! `SessaoAutenticada` agrega o contexto persistido em `refresh_tokens`.

use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum CategoriaDispositivo {
    Desktop,
    Smartphone,
    Tablet,
    Desconhecido,
}

#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct Dispositivo {
    pub categoria: CategoriaDispositivo,
    /// Ex.: "Chrome", "Firefox", "Safari". `None` quando o UA não identifica.
    pub navegador: Option<String>,
    /// Ex.: "Windows 10", "Android", "iPhone". `None` quando indeterminado.
    pub sistema: Option<String>,
}

impl Dispositivo {
    pub fn de_user_agent(user_agent: Option<&str>) -> Self {
        let Some(ua) = user_agent.filter(|s| !s.trim().is_empty()) else {
            return Self::desconhecido();
        };

        let parser = woothee::parser::Parser::new();
        let Some(r) = parser.parse(ua) else {
            return Self::desconhecido();
        };

        let categoria = match r.category {
            "pc" => CategoriaDispositivo::Desktop,
            "smartphone" | "mobilephone" => {
                // woothee classifica tablets como smartphone em parte dos casos;
                // o próprio UA costuma delimitar iPad/Tablet.
                if ua.contains("iPad") || ua.contains("Tablet") {
                    CategoriaDispositivo::Tablet
                } else {
                    CategoriaDispositivo::Smartphone
                }
            }
            "tablet" => CategoriaDispositivo::Tablet,
            _ => CategoriaDispositivo::Desconhecido,
        };

        Self {
            categoria,
            navegador: Some(r.name.to_string()).filter(|n| n != "UNKNOWN"),
            sistema: Some(r.os.to_string()).filter(|o| o != "UNKNOWN"),
        }
    }

    fn desconhecido() -> Self {
        Self {
            categoria: CategoriaDispositivo::Desconhecido,
            navegador: None,
            sistema: None,
        }
    }
}

/// Sessão ativa persistida (uma linha de `refresh_tokens` por login).
#[derive(Debug, Clone)]
pub struct SessaoAutenticada {
    /// `sessao_id` — identidade estável que sobrevive à rotação de tokens.
    pub id: Uuid,
    pub dispositivo: Dispositivo,
    pub ip: Option<String>,
    pub criado_em: DateTime<Utc>,
    pub ultimo_acesso_em: DateTime<Utc>,
}

//! Mapeamento `ErroApp` → HTTP. Envelope consistente:
//! `{ "erro": { "codigo": "...", "mensagem": "...", "campos": [...]? } }`.
//! `Interno` nunca vaza a fonte — vai para `tracing::error`.
//!
//! `ErroHttp` é um newtype: `ResponseError` (actix) não pode ser implementado
//! diretamente em `ErroApp` (application) — regra de orfão e a fronteira
//! arquitetural exigem o wrapper aqui, na camada HTTP.

use actix_web::{http::StatusCode, HttpResponse, ResponseError};
use hweld_application::ErroApp;
use hweld_domain::shared::erro::ErroDominio;
use serde::Serialize;

#[derive(Serialize)]
struct ErroCorpo {
    erro: ErroDetalhe,
}

#[derive(Serialize)]
struct ErroDetalhe {
    codigo: &'static str,
    mensagem: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    campos: Option<Vec<CampoErro>>,
}

#[derive(Serialize)]
struct CampoErro {
    campo: &'static str,
    mensagem: String,
}

/// Erro de aplicação adaptado ao protocolo HTTP.
#[derive(Debug)]
pub struct ErroHttp(pub ErroApp);

pub type Resposta<T> = Result<T, ErroHttp>;

impl From<ErroApp> for ErroHttp {
    fn from(e: ErroApp) -> Self {
        Self(e)
    }
}

impl std::fmt::Display for ErroHttp {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(f)
    }
}

impl ErroHttp {
    fn status(&self) -> StatusCode {
        match &self.0 {
            ErroApp::Dominio(d) => match d {
                ErroDominio::Validacao(_) | ErroDominio::ValorInvalido { .. } => {
                    StatusCode::UNPROCESSABLE_ENTITY
                }
                ErroDominio::TransicaoInvalida { .. } | ErroDominio::EstoqueInsuficiente { .. } => {
                    StatusCode::CONFLICT
                }
                ErroDominio::RegraNegocio(_) => StatusCode::UNPROCESSABLE_ENTITY,
                ErroDominio::NaoEncontrado { .. } => StatusCode::NOT_FOUND,
            },
            ErroApp::NaoAutenticado(_) => StatusCode::UNAUTHORIZED,
            ErroApp::Proibido(_) => StatusCode::FORBIDDEN,
            ErroApp::Conflito(_) => StatusCode::CONFLICT,
            ErroApp::Indisponivel(_) => StatusCode::SERVICE_UNAVAILABLE,
            ErroApp::Interno { .. } => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn corpo(&self) -> ErroCorpo {
        let (codigo, mensagem, campos) = match &self.0 {
            ErroApp::Dominio(ErroDominio::Validacao(cs)) => (
                "validacao",
                "um ou mais campos são inválidos".to_string(),
                Some(
                    cs.iter()
                        .map(|c| CampoErro {
                            campo: c.campo,
                            mensagem: c.mensagem.clone(),
                        })
                        .collect(),
                ),
            ),
            ErroApp::Dominio(d) => (
                match d {
                    ErroDominio::ValorInvalido { .. } => "valor_invalido",
                    ErroDominio::TransicaoInvalida { .. } => "transicao_invalida",
                    ErroDominio::EstoqueInsuficiente { .. } => "estoque_insuficiente",
                    ErroDominio::RegraNegocio(_) => "regra_negocio",
                    ErroDominio::NaoEncontrado { .. } => "nao_encontrado",
                    ErroDominio::Validacao(_) => unreachable!(),
                },
                d.to_string(),
                None,
            ),
            ErroApp::NaoAutenticado(m) => ("nao_autenticado", m.clone(), None),
            ErroApp::Proibido(m) => ("proibido", m.clone(), None),
            ErroApp::Conflito(m) => ("conflito", m.clone(), None),
            ErroApp::Indisponivel(m) => ("indisponivel", format!("{m} indisponível"), None),
            ErroApp::Interno { contexto, fonte } => {
                tracing::error!(contexto = %contexto, erro = %fonte, "erro interno não tratado");
                (
                    "interno",
                    "erro interno — o incidente foi registrado".to_string(),
                    None,
                )
            }
        };
        ErroCorpo {
            erro: ErroDetalhe {
                codigo,
                mensagem,
                campos,
            },
        }
    }
}

impl ResponseError for ErroHttp {
    fn status_code(&self) -> StatusCode {
        self.status()
    }

    fn error_response(&self) -> HttpResponse {
        HttpResponse::build(self.status()).json(self.corpo())
    }
}

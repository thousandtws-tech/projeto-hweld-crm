use async_trait::async_trait;
use chrono::{DateTime, Duration, Utc};
use hweld_application::ports::seguranca::{
    Claims, ContextoSessao, EmissorTokens, ParTokens, RepositorioSessoes, SessaoRow, SujeitoToken,
    TipoSujeito,
};
use hweld_application::{ErroApp, Resultado};
use hweld_domain::acesso::usuario::Perfil;
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use uuid::Uuid;

use crate::config::ConfigJwt;
use crate::persistence::db::erro_db;

const CTX: &str = "tokens";
const REFRESH_BYTES: usize = 32;

#[derive(Debug, Serialize, Deserialize)]
struct ClaimsJwt {
    sub: String,            // id do usuário/contato
    tipo: String,           // "staff" | "portal"
    perfil: Option<String>, // só staff
    exp: usize,
    iat: usize,
    jti: String,
    /// Identidade da sessão (linha-raiz de refresh_tokens) — estável na rotação.
    #[serde(default)]
    sid: Option<Uuid>,
}

pub struct EmissorJwt {
    enc: EncodingKey,
    dec: DecodingKey,
    access_ttl: Duration,
    refresh_ttl: Duration,
    pool: PgPool,
}

impl EmissorJwt {
    pub fn novo(config: &ConfigJwt, pool: PgPool) -> Self {
        Self {
            enc: EncodingKey::from_secret(config.secret.as_bytes()),
            dec: DecodingKey::from_secret(config.secret.as_bytes()),
            access_ttl: Duration::seconds(config.access_ttl_seconds),
            refresh_ttl: Duration::seconds(config.refresh_ttl_seconds),
            pool,
        }
    }

    fn gerar_refresh() -> String {
        // rand 0.9: OsRng implementa TryRngCore — erro é Infallible.
        use rand::TryRngCore;
        let mut buf = [0u8; REFRESH_BYTES];
        let _ = rand::rngs::OsRng.try_fill_bytes(&mut buf);
        hex::encode(buf)
    }

    fn hash_refresh(token: &str) -> String {
        hex::encode(Sha256::digest(token.as_bytes()))
    }

    #[allow(clippy::too_many_arguments)]
    async fn persistir_refresh(
        &self,
        sujeito: SujeitoToken,
        token: &str,
        expira_em: DateTime<Utc>,
        sessao_id: Uuid,
        ctx: &ContextoSessao,
        criado_em: Option<DateTime<Utc>>,
    ) -> Resultado<()> {
        sqlx::query(
            "INSERT INTO refresh_tokens \
             (owner_type, owner_id, token_hash, expires_at, sessao_id, ip, user_agent, created_at) \
             VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8, now()))",
        )
        .bind(sujeito.tipo.as_str())
        .bind(sujeito.id)
        .bind(Self::hash_refresh(token))
        .bind(expira_em)
        .bind(sessao_id)
        .bind(ctx.ip.as_deref())
        .bind(ctx.user_agent.as_deref())
        .bind(criado_em)
        .execute(&self.pool)
        .await
        .map_err(erro_db(CTX))?;
        Ok(())
    }

    fn emitir_access(&self, sujeito: SujeitoToken, sessao_id: Uuid) -> Resultado<(String, i64)> {
        let agora = Utc::now();
        let exp = agora + self.access_ttl;
        let claims = ClaimsJwt {
            sub: sujeito.id.to_string(),
            tipo: sujeito.tipo.as_str().to_string(),
            perfil: sujeito.perfil.map(|p| p.as_str().to_string()),
            exp: exp.timestamp() as usize,
            iat: agora.timestamp() as usize,
            jti: uuid::Uuid::new_v4().to_string(),
            sid: Some(sessao_id),
        };
        let token =
            encode(&Header::default(), &claims, &self.enc).map_err(|e| ErroApp::interno(CTX, e))?;
        Ok((token, self.access_ttl.num_seconds()))
    }

    async fn emitir_par_interno(
        &self,
        sujeito: SujeitoToken,
        ctx: &ContextoSessao,
    ) -> Resultado<ParTokens> {
        let sessao_id = Uuid::new_v4();
        let (access_token, access_expira_em) = self.emitir_access(sujeito, sessao_id)?;
        let refresh_token = Self::gerar_refresh();
        let expira = Utc::now() + self.refresh_ttl;
        self.persistir_refresh(sujeito, &refresh_token, expira, sessao_id, ctx, None)
            .await?;
        Ok(ParTokens {
            access_token,
            access_expira_em,
            refresh_token,
            refresh_expira_em: self.refresh_ttl.num_seconds(),
        })
    }
}

#[async_trait]
impl EmissorTokens for EmissorJwt {
    async fn emitir_par(
        &self,
        sujeito: SujeitoToken,
        ctx: &ContextoSessao,
    ) -> Resultado<ParTokens> {
        self.emitir_par_interno(sujeito, ctx).await
    }

    fn validar_access(&self, token: &str) -> Resultado<Claims> {
        let mut validation = Validation::new(jsonwebtoken::Algorithm::HS256);
        validation.validate_exp = true;
        let dados = decode::<ClaimsJwt>(token, &self.dec, &validation)
            .map_err(|_| ErroApp::nao_autenticado("token inválido ou expirado"))?;
        let c = dados.claims;

        let tipo = match c.tipo.as_str() {
            "staff" => TipoSujeito::Staff,
            "portal" => TipoSujeito::Portal,
            _ => return Err(ErroApp::nao_autenticado("tipo de sujeito desconhecido")),
        };
        let id: i64 = c
            .sub
            .parse()
            .map_err(|_| ErroApp::nao_autenticado("subject inválido"))?;
        let perfil = c
            .perfil
            .as_deref()
            .map(|p| p.parse::<Perfil>())
            .transpose()
            .map_err(|_| ErroApp::nao_autenticado("perfil inválido no token"))?;

        Ok(Claims {
            sujeito: SujeitoToken { tipo, id, perfil },
            exp: c.exp,
            sid: c.sid,
        })
    }

    async fn rotacionar(&self, refresh_token: &str, ctx: &ContextoSessao) -> Resultado<ParTokens> {
        let hash = Self::hash_refresh(refresh_token);
        let mut tx = self.pool.begin().await.map_err(erro_db(CTX))?;

        let row: Option<(
            i64,
            String,
            i64,
            DateTime<Utc>,
            Option<DateTime<Utc>>,
            Uuid,
            Option<String>,
            Option<String>,
            DateTime<Utc>,
        )> = sqlx::query_as(
            "SELECT id, owner_type, owner_id, expires_at, revoked_at, \
                    sessao_id, ip, user_agent, created_at \
                 FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE",
        )
        .bind(&hash)
        .fetch_optional(&mut *tx)
        .await
        .map_err(erro_db(CTX))?;

        let (
            token_id,
            owner_type,
            owner_id,
            expires_at,
            revoked_at,
            sessao_id,
            ip_ant,
            ua_ant,
            criado_em,
        ) = row.ok_or_else(|| ErroApp::nao_autenticado("refresh token inválido"))?;

        if revoked_at.is_some() {
            // Reuso de token rotacionado — comprometimento provável: mata tudo.
            sqlx::query(
                "UPDATE refresh_tokens SET revoked_at = now() \
                 WHERE owner_type = $1 AND owner_id = $2 AND revoked_at IS NULL",
            )
            .bind(&owner_type)
            .bind(owner_id)
            .execute(&mut *tx)
            .await
            .map_err(erro_db(CTX))?;
            tx.commit().await.map_err(erro_db(CTX))?;
            return Err(ErroApp::nao_autenticado(
                "sessão comprometida — faça login novamente",
            ));
        }
        if expires_at < Utc::now() {
            return Err(ErroApp::nao_autenticado("refresh token expirado"));
        }

        // Revoga o token atual e emite o novo par na mesma transação.
        sqlx::query("UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1")
            .bind(token_id)
            .execute(&mut *tx)
            .await
            .map_err(erro_db(CTX))?;

        let tipo = match owner_type.as_str() {
            "staff" => TipoSujeito::Staff,
            _ => TipoSujeito::Portal,
        };
        // Perfil staff é relido (pode ter mudado desde o login).
        let perfil: Option<Perfil> = if tipo == TipoSujeito::Staff {
            sqlx::query_scalar::<_, String>("SELECT perfil FROM usuarios WHERE id = $1")
                .bind(owner_id)
                .fetch_optional(&mut *tx)
                .await
                .map_err(erro_db(CTX))?
                .map(|p| p.parse())
                .transpose()
                .map_err(ErroApp::Dominio)?
        } else {
            None
        };

        let sujeito = SujeitoToken {
            tipo,
            id: owner_id,
            perfil,
        };
        let novo_refresh = Self::gerar_refresh();
        let expira = Utc::now() + self.refresh_ttl;
        // Mesma sessão: sessao_id + created_at herdados; ip/UA atualizados
        // quando o request traz contexto (ex.: mudança de rede).
        let ctx_merged = ContextoSessao {
            ip: ctx.ip.clone().or(ip_ant),
            user_agent: ctx.user_agent.clone().or(ua_ant),
        };
        sqlx::query(
            "INSERT INTO refresh_tokens \
             (owner_type, owner_id, token_hash, expires_at, sessao_id, ip, user_agent, created_at) \
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
        )
        .bind(owner_type)
        .bind(owner_id)
        .bind(Self::hash_refresh(&novo_refresh))
        .bind(expira)
        .bind(sessao_id)
        .bind(ctx_merged.ip.as_deref())
        .bind(ctx_merged.user_agent.as_deref())
        .bind(criado_em)
        .execute(&mut *tx)
        .await
        .map_err(erro_db(CTX))?;

        tx.commit().await.map_err(erro_db(CTX))?;

        let (access_token, access_expira_em) = self.emitir_access(sujeito, sessao_id)?;
        Ok(ParTokens {
            access_token,
            access_expira_em,
            refresh_token: novo_refresh,
            refresh_expira_em: self.refresh_ttl.num_seconds(),
        })
    }

    /// Logout — revoga o refresh apresentado (idempotente).
    async fn revogar(&self, refresh_token: &str) -> Resultado<()> {
        sqlx::query(
            "UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL",
        )
        .bind(Self::hash_refresh(refresh_token))
        .execute(&self.pool)
        .await
        .map_err(erro_db(CTX))?;
        Ok(())
    }
}

/// "Suas sessões" — leitura e revogação das linhas ativas de refresh_tokens.
/// O `token_hash` nunca sai daqui; a API só vê metadados (device/IP/tempo).
#[async_trait]
impl RepositorioSessoes for EmissorJwt {
    async fn listar_ativas(&self, tipo: TipoSujeito, dono: i64) -> Resultado<Vec<SessaoRow>> {
        // Uma linha por sessão: a mais recente de cada sessao_id (rotação gera
        // várias linhas no mesmo sessao_id — só a viva conta).
        let rows: Vec<(Uuid, Option<String>, Option<String>, DateTime<Utc>, DateTime<Utc>)> =
            sqlx::query_as(
                "SELECT sessao_id, ip, user_agent, created_at, ultimo_acesso_em FROM ( \
                   SELECT DISTINCT ON (sessao_id) sessao_id, ip, user_agent, created_at, ultimo_acesso_em \
                   FROM refresh_tokens \
                   WHERE owner_type = $1 AND owner_id = $2 \
                     AND revoked_at IS NULL AND expires_at > now() \
                   ORDER BY sessao_id, created_at DESC \
                 ) s ORDER BY ultimo_acesso_em DESC",
            )
            .bind(tipo.as_str())
            .bind(dono)
            .fetch_all(&self.pool)
            .await
            .map_err(erro_db(CTX))?;

        Ok(rows
            .into_iter()
            .map(
                |(sessao_id, ip, user_agent, criado_em, ultimo_acesso_em)| SessaoRow {
                    sessao_id,
                    ip,
                    user_agent,
                    criado_em,
                    ultimo_acesso_em,
                },
            )
            .collect())
    }

    async fn revogar_sessao(
        &self,
        tipo: TipoSujeito,
        dono: i64,
        sessao_id: Uuid,
    ) -> Resultado<u64> {
        let n = sqlx::query(
            "UPDATE refresh_tokens SET revoked_at = now() \
             WHERE sessao_id = $1 AND owner_type = $2 AND owner_id = $3 AND revoked_at IS NULL",
        )
        .bind(sessao_id)
        .bind(tipo.as_str())
        .bind(dono)
        .execute(&self.pool)
        .await
        .map_err(erro_db(CTX))?
        .rows_affected();
        Ok(n)
    }

    async fn revogar_outras(
        &self,
        tipo: TipoSujeito,
        dono: i64,
        exceto: Option<Uuid>,
    ) -> Resultado<u64> {
        let n = sqlx::query(
            "UPDATE refresh_tokens SET revoked_at = now() \
             WHERE owner_type = $1 AND owner_id = $2 AND revoked_at IS NULL \
               AND sessao_id IS DISTINCT FROM $3",
        )
        .bind(tipo.as_str())
        .bind(dono)
        .bind(exceto)
        .execute(&self.pool)
        .await
        .map_err(erro_db(CTX))?
        .rows_affected();
        Ok(n)
    }
}

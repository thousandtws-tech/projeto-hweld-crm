//! Módulo CRM — empresas, contatos, endereços, oportunidades, interações,
//! orçamentos (com conversão atômica em pedido, §7.1).

use async_trait::async_trait;
use chrono::{DateTime, NaiveDate, Utc};
use hweld_application::ports::crm::{
    FiltroEmpresas, FiltroOportunidades, FiltroOrcamentos, RepositorioContatos,
    RepositorioEmpresas, RepositorioEnderecos, RepositorioInteracoes, RepositorioOportunidades,
    RepositorioOrcamentos,
};
use hweld_application::ports::vendas::NovoPedido;
use hweld_application::{ErroApp, Resultado};
use hweld_domain::crm::contato::{Contato, ContatoInput};
use hweld_domain::crm::empresa::{Empresa, EmpresaInput};
use hweld_domain::crm::endereco::{Endereco, EnderecoInput, TipoEndereco};
use hweld_domain::crm::interacao::{Interacao, InteracaoInput};
use hweld_domain::crm::oportunidade::{EstagioOportunidade, Oportunidade, OportunidadeInput};
use hweld_domain::crm::orcamento::{
    ItemOrcamentoNovo, Orcamento, OrcamentoInput, OrcamentoItem, StatusOrcamento,
};
use hweld_domain::shared::dinheiro::Dinheiro;
use hweld_domain::shared::documento::TipoDocumento;
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::{Pagina, Paginacao};
use hweld_domain::vendas::pedido::Pedido;
use rust_decimal::Decimal;
use sqlx::{FromRow, PgPool, Postgres, QueryBuilder};

use super::cache::{chave_lista, invalidar_listas, CacheListas};
use super::db::{erro_db, proximo_numero};
use super::vendas::inserir_pedido_tx;

// ---------------------------------------------------------------------------
// Empresas
// ---------------------------------------------------------------------------

const CTX_EMP: &str = "empresas";
const EMP_COLS: &str = "id, public_id, razao_social, nome_fantasia, cnpj, inscricao_estadual, \
    segmento, telefone, email, site, status, tabela_preco_id, observacoes, \
    created_at, updated_at, deleted_at";

#[derive(FromRow)]
struct EmpresaRow {
    id: i64,
    public_id: uuid::Uuid,
    razao_social: String,
    nome_fantasia: Option<String>,
    cnpj: Option<String>,
    inscricao_estadual: Option<String>,
    segmento: Option<String>,
    telefone: Option<String>,
    email: Option<String>,
    site: Option<String>,
    status: String,
    tabela_preco_id: Option<i64>,
    observacoes: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    deleted_at: Option<DateTime<Utc>>,
}

impl TryFrom<EmpresaRow> for Empresa {
    type Error = hweld_domain::ErroDominio;

    fn try_from(r: EmpresaRow) -> Result<Self, Self::Error> {
        Ok(Self {
            id: Id::novo(r.id),
            public_id: r.public_id,
            razao_social: r.razao_social,
            nome_fantasia: r.nome_fantasia,
            cnpj: r.cnpj,
            inscricao_estadual: r.inscricao_estadual,
            segmento: r.segmento,
            telefone: r.telefone,
            email: r.email,
            site: r.site,
            status: r.status.parse()?,
            tabela_preco_id: r.tabela_preco_id.map(Id::novo),
            observacoes: r.observacoes,
            created_at: r.created_at,
            updated_at: r.updated_at,
            deleted_at: r.deleted_at,
        })
    }
}

fn map_empresa(r: EmpresaRow) -> Resultado<Empresa> {
    Empresa::try_from(r).map_err(ErroApp::Dominio)
}

pub struct RepositorioEmpresasPg {
    pool: PgPool,
    cache_listas: CacheListas<Pagina<Empresa>>,
}

impl RepositorioEmpresasPg {
    pub fn novo(pool: PgPool) -> Self {
        Self {
            pool,
            cache_listas: CacheListas::novo("empresas"),
        }
    }
}

#[async_trait]
impl RepositorioEmpresas for RepositorioEmpresasPg {
    async fn buscar_por_id(&self, id: Id<Empresa>) -> Resultado<Option<Empresa>> {
        let row = sqlx::query_as::<_, EmpresaRow>(&format!(
            "SELECT {EMP_COLS} FROM empresas WHERE id = $1 AND deleted_at IS NULL"
        ))
        .bind(id.valor())
        .fetch_optional(&self.pool)
        .await
        .map_err(erro_db(CTX_EMP))?;
        row.map(map_empresa).transpose()
    }

    async fn buscar_por_public_id(&self, public_id: uuid::Uuid) -> Resultado<Option<Empresa>> {
        let row = sqlx::query_as::<_, EmpresaRow>(&format!(
            "SELECT {EMP_COLS} FROM empresas WHERE public_id = $1 AND deleted_at IS NULL"
        ))
        .bind(public_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(erro_db(CTX_EMP))?;
        row.map(map_empresa).transpose()
    }

    async fn buscar_por_cnpj(&self, cnpj: &str) -> Resultado<Option<Empresa>> {
        let row = sqlx::query_as::<_, EmpresaRow>(&format!(
            "SELECT {EMP_COLS} FROM empresas WHERE cnpj = $1 AND deleted_at IS NULL"
        ))
        .bind(cnpj)
        .fetch_optional(&self.pool)
        .await
        .map_err(erro_db(CTX_EMP))?;
        row.map(map_empresa).transpose()
    }

    async fn listar(
        &self,
        paginacao: Paginacao,
        filtro: FiltroEmpresas,
    ) -> Resultado<Pagina<Empresa>> {
        let chave = chave_lista(&paginacao, &filtro);
        if let Some(p) = self.cache_listas.get(&chave) {
            return Ok(p);
        }

        let mut count_qb =
            QueryBuilder::<Postgres>::new("SELECT COUNT(*) FROM empresas WHERE deleted_at IS NULL");
        push_filtro_empresas(&mut count_qb, &filtro);

        let mut qb = QueryBuilder::<Postgres>::new(&format!(
            "SELECT {EMP_COLS} FROM empresas WHERE deleted_at IS NULL"
        ));
        push_filtro_empresas(&mut qb, &filtro);
        qb.push(" ORDER BY razao_social LIMIT ")
            .push_bind(paginacao.limite())
            .push(" OFFSET ")
            .push_bind(paginacao.offset());

        // COUNT + SELECT em paralelo: duas conexões do pool, um round-trip de latência.
        let (total_res, rows_res) = tokio::join!(
            count_qb.build_query_as::<(i64,)>().fetch_one(&self.pool),
            qb.build_query_as::<EmpresaRow>().fetch_all(&self.pool),
        );
        let (total,) = total_res.map_err(erro_db(CTX_EMP))?;
        let rows = rows_res.map_err(erro_db(CTX_EMP))?;

        let itens = rows
            .into_iter()
            .map(map_empresa)
            .collect::<Resultado<Vec<_>>>()?;
        let pagina = Pagina::nova(itens, total, paginacao);
        self.cache_listas.set(chave, pagina.clone());
        Ok(pagina)
    }

    async fn criar(&self, input: EmpresaInput) -> Resultado<Empresa> {
        let row = sqlx::query_as::<_, EmpresaRow>(&format!(
            "INSERT INTO empresas (razao_social, nome_fantasia, cnpj, inscricao_estadual, \
             segmento, telefone, email, site, status, tabela_preco_id, observacoes) \
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING {EMP_COLS}"
        ))
        .bind(input.razao_social)
        .bind(input.nome_fantasia)
        .bind(input.cnpj)
        .bind(input.inscricao_estadual)
        .bind(input.segmento)
        .bind(input.telefone)
        .bind(input.email.map(|e| e.to_lowercase()))
        .bind(input.site)
        .bind(input.status.as_str())
        .bind(input.tabela_preco_id.map(|i| i.valor()))
        .bind(input.observacoes)
        .fetch_one(&self.pool)
        .await
        .map_err(erro_db(CTX_EMP))?;
        let empresa = map_empresa(row)?;
        invalidar_listas();
        Ok(empresa)
    }

    async fn atualizar(&self, id: Id<Empresa>, input: EmpresaInput) -> Resultado<Empresa> {
        let row = sqlx::query_as::<_, EmpresaRow>(&format!(
            "UPDATE empresas SET razao_social=$2, nome_fantasia=$3, cnpj=$4, \
             inscricao_estadual=$5, segmento=$6, telefone=$7, email=$8, site=$9, \
             status=$10, tabela_preco_id=$11, observacoes=$12, updated_at=now() \
             WHERE id=$1 AND deleted_at IS NULL RETURNING {EMP_COLS}"
        ))
        .bind(id.valor())
        .bind(input.razao_social)
        .bind(input.nome_fantasia)
        .bind(input.cnpj)
        .bind(input.inscricao_estadual)
        .bind(input.segmento)
        .bind(input.telefone)
        .bind(input.email.map(|e| e.to_lowercase()))
        .bind(input.site)
        .bind(input.status.as_str())
        .bind(input.tabela_preco_id.map(|i| i.valor()))
        .bind(input.observacoes)
        .fetch_one(&self.pool)
        .await
        .map_err(erro_db(CTX_EMP))?;
        let empresa = map_empresa(row)?;
        invalidar_listas();
        Ok(empresa)
    }

    /// Soft delete — empresas nunca são removidas fisicamente (§7.5).
    async fn arquivar(&self, id: Id<Empresa>) -> Resultado<()> {
        sqlx::query("UPDATE empresas SET deleted_at = now(), updated_at = now() WHERE id = $1")
            .bind(id.valor())
            .execute(&self.pool)
            .await
            .map_err(erro_db(CTX_EMP))?;
        invalidar_listas();
        Ok(())
    }
}

fn push_filtro_empresas<'a>(qb: &mut QueryBuilder<'a, Postgres>, filtro: &'a FiltroEmpresas) {
    if let Some(status) = filtro.status {
        qb.push(" AND status = ").push_bind(status.as_str());
    }
    if let Some(busca) = filtro.busca.as_ref().filter(|b| !b.trim().is_empty()) {
        let padrao = format!("%{}%", busca.trim());
        qb.push(" AND (razao_social ILIKE ")
            .push_bind(padrao.clone())
            .push(" OR nome_fantasia ILIKE ")
            .push_bind(padrao.clone())
            .push(" OR cnpj ILIKE ")
            .push_bind(padrao)
            .push(")");
    }
}

// ---------------------------------------------------------------------------
// Contatos
// ---------------------------------------------------------------------------

const CTX_CTT: &str = "contatos";
const CTT_COLS: &str = "id, empresa_id, nome, cargo, email, telefone, whatsapp, \
    is_principal, acesso_portal, senha_hash, observacoes, created_at, updated_at, deleted_at";

#[derive(FromRow)]
struct ContatoRow {
    id: i64,
    empresa_id: i64,
    nome: String,
    cargo: Option<String>,
    email: Option<String>,
    telefone: Option<String>,
    whatsapp: Option<String>,
    is_principal: bool,
    acesso_portal: bool,
    senha_hash: Option<String>,
    observacoes: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    deleted_at: Option<DateTime<Utc>>,
}

impl From<ContatoRow> for Contato {
    fn from(r: ContatoRow) -> Self {
        Self {
            id: Id::novo(r.id),
            empresa_id: Id::novo(r.empresa_id),
            nome: r.nome,
            cargo: r.cargo,
            email: r.email,
            telefone: r.telefone,
            whatsapp: r.whatsapp,
            is_principal: r.is_principal,
            acesso_portal: r.acesso_portal,
            senha_hash: r.senha_hash,
            observacoes: r.observacoes,
            created_at: r.created_at,
            updated_at: r.updated_at,
            deleted_at: r.deleted_at,
        }
    }
}

pub struct RepositorioContatosPg {
    pool: PgPool,
    cache_listas: CacheListas<Pagina<Contato>>,
}

impl RepositorioContatosPg {
    pub fn novo(pool: PgPool) -> Self {
        Self {
            pool,
            cache_listas: CacheListas::novo("contatos"),
        }
    }
}

#[async_trait]
impl RepositorioContatos for RepositorioContatosPg {
    async fn buscar_por_id(&self, id: Id<Contato>) -> Resultado<Option<Contato>> {
        let row = sqlx::query_as::<_, ContatoRow>(&format!(
            "SELECT {CTT_COLS} FROM contatos WHERE id = $1 AND deleted_at IS NULL"
        ))
        .bind(id.valor())
        .fetch_optional(&self.pool)
        .await
        .map_err(erro_db(CTX_CTT))?;
        Ok(row.map(Contato::from))
    }

    async fn buscar_por_email(&self, email: &str) -> Resultado<Option<Contato>> {
        let row = sqlx::query_as::<_, ContatoRow>(&format!(
            "SELECT {CTT_COLS} FROM contatos WHERE email = $1 AND deleted_at IS NULL"
        ))
        .bind(email.to_lowercase())
        .fetch_optional(&self.pool)
        .await
        .map_err(erro_db(CTX_CTT))?;
        Ok(row.map(Contato::from))
    }

    async fn listar_por_empresa(&self, empresa_id: Id<Empresa>) -> Resultado<Vec<Contato>> {
        let rows = sqlx::query_as::<_, ContatoRow>(&format!(
            "SELECT {CTT_COLS} FROM contatos WHERE empresa_id = $1 AND deleted_at IS NULL \
             ORDER BY is_principal DESC, nome"
        ))
        .bind(empresa_id.valor())
        .fetch_all(&self.pool)
        .await
        .map_err(erro_db(CTX_CTT))?;
        Ok(rows.into_iter().map(Contato::from).collect())
    }

    async fn listar(
        &self,
        paginacao: Paginacao,
        empresa_id: Option<Id<Empresa>>,
        busca: Option<String>,
    ) -> Resultado<Pagina<Contato>> {
        let chave = format!("{paginacao:?}|{empresa_id:?}|{busca:?}");
        if let Some(p) = self.cache_listas.get(&chave) {
            return Ok(p);
        }

        let mut count_qb =
            QueryBuilder::<Postgres>::new("SELECT COUNT(*) FROM contatos WHERE deleted_at IS NULL");
        push_filtro_contatos(&mut count_qb, &empresa_id, &busca);

        let mut qb = QueryBuilder::<Postgres>::new(&format!(
            "SELECT {CTT_COLS} FROM contatos WHERE deleted_at IS NULL"
        ));
        push_filtro_contatos(&mut qb, &empresa_id, &busca);
        qb.push(" ORDER BY nome LIMIT ")
            .push_bind(paginacao.limite())
            .push(" OFFSET ")
            .push_bind(paginacao.offset());
        let (total_res, rows_res) = tokio::join!(
            count_qb.build_query_as::<(i64,)>().fetch_one(&self.pool),
            qb.build_query_as::<ContatoRow>().fetch_all(&self.pool),
        );
        let (total,) = total_res.map_err(erro_db(CTX_CTT))?;
        let rows = rows_res.map_err(erro_db(CTX_CTT))?;

        let pagina = Pagina::nova(
            rows.into_iter().map(Contato::from).collect(),
            total,
            paginacao,
        );
        self.cache_listas.set(chave, pagina.clone());
        Ok(pagina)
    }

    async fn criar(&self, input: ContatoInput) -> Resultado<Contato> {
        let row = sqlx::query_as::<_, ContatoRow>(&format!(
            "INSERT INTO contatos (empresa_id, nome, cargo, email, telefone, whatsapp, \
             is_principal, acesso_portal, observacoes) \
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING {CTT_COLS}"
        ))
        .bind(input.empresa_id.valor())
        .bind(input.nome)
        .bind(input.cargo)
        .bind(input.email.map(|e| e.to_lowercase()))
        .bind(input.telefone)
        .bind(input.whatsapp)
        .bind(input.is_principal)
        .bind(input.acesso_portal)
        .bind(input.observacoes)
        .fetch_one(&self.pool)
        .await
        .map_err(erro_db(CTX_CTT))?;
        invalidar_listas();
        Ok(Contato::from(row))
    }

    async fn atualizar(&self, id: Id<Contato>, input: ContatoInput) -> Resultado<Contato> {
        let row = sqlx::query_as::<_, ContatoRow>(&format!(
            "UPDATE contatos SET empresa_id=$2, nome=$3, cargo=$4, email=$5, telefone=$6, \
             whatsapp=$7, is_principal=$8, acesso_portal=$9, observacoes=$10, updated_at=now() \
             WHERE id=$1 AND deleted_at IS NULL RETURNING {CTT_COLS}"
        ))
        .bind(id.valor())
        .bind(input.empresa_id.valor())
        .bind(input.nome)
        .bind(input.cargo)
        .bind(input.email.map(|e| e.to_lowercase()))
        .bind(input.telefone)
        .bind(input.whatsapp)
        .bind(input.is_principal)
        .bind(input.acesso_portal)
        .bind(input.observacoes)
        .fetch_one(&self.pool)
        .await
        .map_err(erro_db(CTX_CTT))?;
        invalidar_listas();
        Ok(Contato::from(row))
    }

    /// Gerencia credencial do portal: ativa/desativa e (re)define o hash.
    async fn definir_acesso_portal(
        &self,
        id: Id<Contato>,
        ativo: bool,
        senha_hash: Option<&str>,
    ) -> Resultado<()> {
        if let Some(hash) = senha_hash {
            sqlx::query(
                "UPDATE contatos SET acesso_portal=$2, senha_hash=$3, updated_at=now() WHERE id=$1",
            )
            .bind(id.valor())
            .bind(ativo)
            .bind(hash)
            .execute(&self.pool)
            .await
            .map_err(erro_db(CTX_CTT))?;
        } else {
            sqlx::query("UPDATE contatos SET acesso_portal=$2, updated_at=now() WHERE id=$1")
                .bind(id.valor())
                .bind(ativo)
                .execute(&self.pool)
                .await
                .map_err(erro_db(CTX_CTT))?;
        }
        invalidar_listas();
        Ok(())
    }

    async fn arquivar(&self, id: Id<Contato>) -> Resultado<()> {
        sqlx::query("UPDATE contatos SET deleted_at = now(), updated_at = now() WHERE id = $1")
            .bind(id.valor())
            .execute(&self.pool)
            .await
            .map_err(erro_db(CTX_CTT))?;
        invalidar_listas();
        Ok(())
    }
}

fn push_filtro_contatos<'a>(
    qb: &mut QueryBuilder<'a, Postgres>,
    empresa_id: &'a Option<Id<Empresa>>,
    busca: &'a Option<String>,
) {
    if let Some(empresa_id) = empresa_id {
        qb.push(" AND empresa_id = ").push_bind(empresa_id.valor());
    }
    if let Some(busca) = busca.as_ref().filter(|b| !b.trim().is_empty()) {
        let padrao = format!("%{}%", busca.trim());
        qb.push(" AND (nome ILIKE ")
            .push_bind(padrao.clone())
            .push(" OR email ILIKE ")
            .push_bind(padrao)
            .push(")");
    }
}

// ---------------------------------------------------------------------------
// Endereços
// ---------------------------------------------------------------------------

const CTX_END: &str = "enderecos";
const END_COLS: &str = "id, empresa_id, tipo, logradouro, numero, complemento, bairro, \
    cidade, uf, cep, pais, principal, created_at, updated_at";

#[derive(FromRow)]
struct EnderecoRow {
    id: i64,
    empresa_id: i64,
    tipo: String,
    logradouro: Option<String>,
    numero: Option<String>,
    complemento: Option<String>,
    bairro: Option<String>,
    cidade: String,
    uf: String,
    cep: String,
    pais: String,
    principal: bool,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl TryFrom<EnderecoRow> for Endereco {
    type Error = hweld_domain::ErroDominio;

    fn try_from(r: EnderecoRow) -> Result<Self, Self::Error> {
        Ok(Self {
            id: Id::novo(r.id),
            empresa_id: Id::novo(r.empresa_id),
            tipo: r.tipo.parse()?,
            logradouro: r.logradouro,
            numero: r.numero,
            complemento: r.complemento,
            bairro: r.bairro,
            cidade: r.cidade,
            uf: r.uf,
            cep: r.cep,
            pais: r.pais,
            principal: r.principal,
            created_at: r.created_at,
            updated_at: r.updated_at,
        })
    }
}

fn map_endereco(r: EnderecoRow) -> Resultado<Endereco> {
    Endereco::try_from(r).map_err(ErroApp::Dominio)
}

pub struct RepositorioEnderecosPg {
    pool: PgPool,
}

impl RepositorioEnderecosPg {
    pub fn novo(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl RepositorioEnderecos for RepositorioEnderecosPg {
    async fn buscar_por_id(&self, id: Id<Endereco>) -> Resultado<Option<Endereco>> {
        let row = sqlx::query_as::<_, EnderecoRow>(&format!(
            "SELECT {END_COLS} FROM enderecos WHERE id = $1"
        ))
        .bind(id.valor())
        .fetch_optional(&self.pool)
        .await
        .map_err(erro_db(CTX_END))?;
        row.map(map_endereco).transpose()
    }

    async fn listar_por_empresa(
        &self,
        empresa_id: Id<Empresa>,
        tipo: Option<TipoEndereco>,
    ) -> Resultado<Vec<Endereco>> {
        let mut qb = QueryBuilder::<Postgres>::new(&format!(
            "SELECT {END_COLS} FROM enderecos WHERE empresa_id = "
        ));
        qb.push_bind(empresa_id.valor());
        if let Some(tipo) = tipo {
            qb.push(" AND tipo = ").push_bind(tipo.as_str());
        }
        qb.push(" ORDER BY principal DESC, id");
        let rows = qb
            .build_query_as::<EnderecoRow>()
            .fetch_all(&self.pool)
            .await
            .map_err(erro_db(CTX_END))?;
        rows.into_iter().map(map_endereco).collect()
    }

    /// Novo endereço `principal` desmarca os demais da mesma empresa+tipo
    /// na mesma transação — invariante de "um principal por tipo".
    async fn criar(&self, input: EnderecoInput) -> Resultado<Endereco> {
        let mut tx = self.pool.begin().await.map_err(erro_db(CTX_END))?;
        if input.principal {
            limpar_principal_tx(&mut tx, input.empresa_id, input.tipo).await?;
        }
        let row = sqlx::query_as::<_, EnderecoRow>(&format!(
            "INSERT INTO enderecos (empresa_id, tipo, logradouro, numero, complemento, \
             bairro, cidade, uf, cep, pais, principal) \
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING {END_COLS}"
        ))
        .bind(input.empresa_id.valor())
        .bind(input.tipo.as_str())
        .bind(input.logradouro)
        .bind(input.numero)
        .bind(input.complemento)
        .bind(input.bairro)
        .bind(input.cidade)
        .bind(input.uf)
        .bind(input.cep)
        .bind(input.pais.unwrap_or_else(|| "Brasil".into()))
        .bind(input.principal)
        .fetch_one(&mut *tx)
        .await
        .map_err(erro_db(CTX_END))?;
        let end = map_endereco(row)?;
        tx.commit().await.map_err(erro_db(CTX_END))?;
        Ok(end)
    }

    async fn atualizar(&self, id: Id<Endereco>, input: EnderecoInput) -> Resultado<Endereco> {
        let mut tx = self.pool.begin().await.map_err(erro_db(CTX_END))?;
        if input.principal {
            limpar_principal_tx(&mut tx, input.empresa_id, input.tipo).await?;
        }
        let row = sqlx::query_as::<_, EnderecoRow>(&format!(
            "UPDATE enderecos SET empresa_id=$2, tipo=$3, logradouro=$4, numero=$5, \
             complemento=$6, bairro=$7, cidade=$8, uf=$9, cep=$10, pais=$11, \
             principal=$12, updated_at=now() WHERE id=$1 RETURNING {END_COLS}"
        ))
        .bind(id.valor())
        .bind(input.empresa_id.valor())
        .bind(input.tipo.as_str())
        .bind(input.logradouro)
        .bind(input.numero)
        .bind(input.complemento)
        .bind(input.bairro)
        .bind(input.cidade)
        .bind(input.uf)
        .bind(input.cep)
        .bind(input.pais.unwrap_or_else(|| "Brasil".into()))
        .bind(input.principal)
        .fetch_one(&mut *tx)
        .await
        .map_err(erro_db(CTX_END))?;
        let end = map_endereco(row)?;
        tx.commit().await.map_err(erro_db(CTX_END))?;
        Ok(end)
    }

    async fn remover(&self, id: Id<Endereco>) -> Resultado<()> {
        sqlx::query("DELETE FROM enderecos WHERE id = $1")
            .bind(id.valor())
            .execute(&self.pool)
            .await
            .map_err(erro_db(CTX_END))?;
        Ok(())
    }

    async fn definir_principal(&self, id: Id<Endereco>) -> Resultado<()> {
        let mut tx = self.pool.begin().await.map_err(erro_db(CTX_END))?;
        let alvo: Option<(i64, String)> =
            sqlx::query_as("SELECT empresa_id, tipo FROM enderecos WHERE id = $1")
                .bind(id.valor())
                .fetch_optional(&mut *tx)
                .await
                .map_err(erro_db(CTX_END))?;
        let (empresa_id, tipo) =
            alvo.ok_or_else(|| ErroApp::nao_encontrado("endereco", id.valor()))?;
        let tipo: TipoEndereco = tipo.parse().map_err(ErroApp::Dominio)?;
        limpar_principal_tx(&mut tx, Id::novo(empresa_id), tipo).await?;
        sqlx::query("UPDATE enderecos SET principal = TRUE, updated_at = now() WHERE id = $1")
            .bind(id.valor())
            .execute(&mut *tx)
            .await
            .map_err(erro_db(CTX_END))?;
        tx.commit().await.map_err(erro_db(CTX_END))
    }
}

async fn limpar_principal_tx(
    tx: &mut sqlx::Transaction<'_, Postgres>,
    empresa_id: Id<Empresa>,
    tipo: TipoEndereco,
) -> Resultado<()> {
    sqlx::query(
        "UPDATE enderecos SET principal = FALSE, updated_at = now() \
         WHERE empresa_id = $1 AND tipo = $2 AND principal",
    )
    .bind(empresa_id.valor())
    .bind(tipo.as_str())
    .execute(&mut **tx)
    .await
    .map_err(erro_db(CTX_END))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Oportunidades
// ---------------------------------------------------------------------------

const CTX_OPO: &str = "oportunidades";
const OPO_COLS: &str = "id, empresa_id, contato_id, responsavel_id, titulo, descricao, \
    origem, estagio, valor_estimado, data_prevista_fechamento, motivo_perda, \
    created_at, updated_at";

#[derive(FromRow)]
struct OportunidadeRow {
    id: i64,
    empresa_id: i64,
    contato_id: Option<i64>,
    responsavel_id: i64,
    titulo: String,
    descricao: Option<String>,
    origem: Option<String>,
    estagio: String,
    valor_estimado: Option<Decimal>,
    data_prevista_fechamento: Option<NaiveDate>,
    motivo_perda: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl TryFrom<OportunidadeRow> for Oportunidade {
    type Error = hweld_domain::ErroDominio;

    fn try_from(r: OportunidadeRow) -> Result<Self, Self::Error> {
        Ok(Self {
            id: Id::novo(r.id),
            empresa_id: Id::novo(r.empresa_id),
            contato_id: r.contato_id.map(Id::novo),
            responsavel_id: Id::novo(r.responsavel_id),
            titulo: r.titulo,
            descricao: r.descricao,
            origem: r.origem.map(|o| o.parse()).transpose()?,
            estagio: r.estagio.parse()?,
            valor_estimado: r.valor_estimado.map(Dinheiro::novo),
            data_prevista_fechamento: r.data_prevista_fechamento,
            motivo_perda: r.motivo_perda,
            created_at: r.created_at,
            updated_at: r.updated_at,
        })
    }
}

fn map_oportunidade(r: OportunidadeRow) -> Resultado<Oportunidade> {
    Oportunidade::try_from(r).map_err(ErroApp::Dominio)
}

pub struct RepositorioOportunidadesPg {
    pool: PgPool,
    cache_listas: CacheListas<Pagina<Oportunidade>>,
}

impl RepositorioOportunidadesPg {
    pub fn novo(pool: PgPool) -> Self {
        Self {
            pool,
            cache_listas: CacheListas::novo("oportunidades"),
        }
    }
}

#[async_trait]
impl RepositorioOportunidades for RepositorioOportunidadesPg {
    async fn buscar_por_id(&self, id: Id<Oportunidade>) -> Resultado<Option<Oportunidade>> {
        let row = sqlx::query_as::<_, OportunidadeRow>(&format!(
            "SELECT {OPO_COLS} FROM oportunidades WHERE id = $1"
        ))
        .bind(id.valor())
        .fetch_optional(&self.pool)
        .await
        .map_err(erro_db(CTX_OPO))?;
        row.map(map_oportunidade).transpose()
    }

    async fn listar(
        &self,
        paginacao: Paginacao,
        filtro: FiltroOportunidades,
    ) -> Resultado<Pagina<Oportunidade>> {
        let chave = chave_lista(&paginacao, &filtro);
        if let Some(p) = self.cache_listas.get(&chave) {
            return Ok(p);
        }

        let mut count_qb =
            QueryBuilder::<Postgres>::new("SELECT COUNT(*) FROM oportunidades WHERE TRUE");
        push_filtro_oportunidades(&mut count_qb, &filtro);

        let mut qb = QueryBuilder::<Postgres>::new(&format!(
            "SELECT {OPO_COLS} FROM oportunidades WHERE TRUE"
        ));
        push_filtro_oportunidades(&mut qb, &filtro);
        qb.push(" ORDER BY id DESC LIMIT ")
            .push_bind(paginacao.limite())
            .push(" OFFSET ")
            .push_bind(paginacao.offset());
        let (total_res, rows_res) = tokio::join!(
            count_qb.build_query_as::<(i64,)>().fetch_one(&self.pool),
            qb.build_query_as::<OportunidadeRow>().fetch_all(&self.pool),
        );
        let (total,) = total_res.map_err(erro_db(CTX_OPO))?;
        let rows = rows_res.map_err(erro_db(CTX_OPO))?;

        let itens = rows
            .into_iter()
            .map(map_oportunidade)
            .collect::<Resultado<Vec<_>>>()?;
        let pagina = Pagina::nova(itens, total, paginacao);
        self.cache_listas.set(chave, pagina.clone());
        Ok(pagina)
    }

    async fn criar(&self, input: OportunidadeInput) -> Resultado<Oportunidade> {
        let row = sqlx::query_as::<_, OportunidadeRow>(&format!(
            "INSERT INTO oportunidades (empresa_id, contato_id, responsavel_id, titulo, \
             descricao, origem, estagio, valor_estimado, data_prevista_fechamento) \
             VALUES ($1,$2,$3,$4,$5,$6,'lead',$7,$8) RETURNING {OPO_COLS}"
        ))
        .bind(input.empresa_id.valor())
        .bind(input.contato_id.map(|i| i.valor()))
        .bind(input.responsavel_id.valor())
        .bind(input.titulo)
        .bind(input.descricao)
        .bind(input.origem.map(|o| o.as_str()))
        .bind(input.valor_estimado)
        .bind(input.data_prevista_fechamento)
        .fetch_one(&self.pool)
        .await
        .map_err(erro_db(CTX_OPO))?;
        let oportunidade = map_oportunidade(row)?;
        invalidar_listas();
        Ok(oportunidade)
    }

    async fn atualizar(
        &self,
        id: Id<Oportunidade>,
        input: OportunidadeInput,
    ) -> Resultado<Oportunidade> {
        let row = sqlx::query_as::<_, OportunidadeRow>(&format!(
            "UPDATE oportunidades SET empresa_id=$2, contato_id=$3, responsavel_id=$4, \
             titulo=$5, descricao=$6, origem=$7, valor_estimado=$8, \
             data_prevista_fechamento=$9, updated_at=now() \
             WHERE id=$1 RETURNING {OPO_COLS}"
        ))
        .bind(id.valor())
        .bind(input.empresa_id.valor())
        .bind(input.contato_id.map(|i| i.valor()))
        .bind(input.responsavel_id.valor())
        .bind(input.titulo)
        .bind(input.descricao)
        .bind(input.origem.map(|o| o.as_str()))
        .bind(input.valor_estimado)
        .bind(input.data_prevista_fechamento)
        .fetch_one(&self.pool)
        .await
        .map_err(erro_db(CTX_OPO))?;
        let oportunidade = map_oportunidade(row)?;
        invalidar_listas();
        Ok(oportunidade)
    }

    async fn mover_estagio(
        &self,
        id: Id<Oportunidade>,
        estagio: EstagioOportunidade,
        motivo_perda: Option<&str>,
    ) -> Resultado<Oportunidade> {
        let row = sqlx::query_as::<_, OportunidadeRow>(&format!(
            "UPDATE oportunidades SET estagio=$2, motivo_perda=$3, updated_at=now() \
             WHERE id=$1 RETURNING {OPO_COLS}"
        ))
        .bind(id.valor())
        .bind(estagio.as_str())
        .bind(motivo_perda)
        .fetch_one(&self.pool)
        .await
        .map_err(erro_db(CTX_OPO))?;
        let oportunidade = map_oportunidade(row)?;
        invalidar_listas();
        Ok(oportunidade)
    }
}

fn push_filtro_oportunidades<'a>(
    qb: &mut QueryBuilder<'a, Postgres>,
    filtro: &'a FiltroOportunidades,
) {
    if let Some(estagio) = filtro.estagio {
        qb.push(" AND estagio = ").push_bind(estagio.as_str());
    }
    if let Some(empresa_id) = filtro.empresa_id {
        qb.push(" AND empresa_id = ").push_bind(empresa_id.valor());
    }
    if let Some(responsavel_id) = filtro.responsavel_id {
        qb.push(" AND responsavel_id = ")
            .push_bind(responsavel_id.valor());
    }
}

// ---------------------------------------------------------------------------
// Interações — append-only (§7.2): só INSERT + SELECT, nunca UPDATE/DELETE.
// ---------------------------------------------------------------------------

const CTX_INT: &str = "interacoes";
const INT_COLS: &str = "id, empresa_id, contato_id, oportunidade_id, usuario_id, tipo, \
    assunto, descricao, ocorrido_em, proxima_acao, proxima_acao_em, created_at";

#[derive(FromRow)]
struct InteracaoRow {
    id: i64,
    empresa_id: i64,
    contato_id: Option<i64>,
    oportunidade_id: Option<i64>,
    usuario_id: Option<i64>,
    tipo: String,
    assunto: Option<String>,
    descricao: Option<String>,
    ocorrido_em: DateTime<Utc>,
    proxima_acao: Option<String>,
    proxima_acao_em: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
}

impl TryFrom<InteracaoRow> for Interacao {
    type Error = hweld_domain::ErroDominio;

    fn try_from(r: InteracaoRow) -> Result<Self, Self::Error> {
        Ok(Self {
            id: Id::novo(r.id),
            empresa_id: Id::novo(r.empresa_id),
            contato_id: r.contato_id.map(Id::novo),
            oportunidade_id: r.oportunidade_id.map(Id::novo),
            usuario_id: r.usuario_id.map(Id::novo),
            tipo: r.tipo.parse()?,
            assunto: r.assunto,
            descricao: r.descricao,
            ocorrido_em: r.ocorrido_em,
            proxima_acao: r.proxima_acao,
            proxima_acao_em: r.proxima_acao_em,
            created_at: r.created_at,
        })
    }
}

fn map_interacao(r: InteracaoRow) -> Resultado<Interacao> {
    Interacao::try_from(r).map_err(ErroApp::Dominio)
}

pub struct RepositorioInteracoesPg {
    pool: PgPool,
    cache_listas: CacheListas<Pagina<Interacao>>,
}

impl RepositorioInteracoesPg {
    pub fn novo(pool: PgPool) -> Self {
        Self {
            pool,
            cache_listas: CacheListas::novo("interacoes"),
        }
    }
}

#[async_trait]
impl RepositorioInteracoes for RepositorioInteracoesPg {
    async fn criar(&self, input: InteracaoInput) -> Resultado<Interacao> {
        let row = sqlx::query_as::<_, InteracaoRow>(&format!(
            "INSERT INTO interacoes (empresa_id, contato_id, oportunidade_id, usuario_id, \
             tipo, assunto, descricao, ocorrido_em, proxima_acao, proxima_acao_em) \
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING {INT_COLS}"
        ))
        .bind(input.empresa_id.valor())
        .bind(input.contato_id.map(|i| i.valor()))
        .bind(input.oportunidade_id.map(|i| i.valor()))
        .bind(input.usuario_id.map(|i| i.valor()))
        .bind(input.tipo.as_str())
        .bind(input.assunto)
        .bind(input.descricao)
        .bind(input.ocorrido_em)
        .bind(input.proxima_acao)
        .bind(input.proxima_acao_em)
        .fetch_one(&self.pool)
        .await
        .map_err(erro_db(CTX_INT))?;
        let interacao = map_interacao(row)?;
        invalidar_listas();
        Ok(interacao)
    }

    async fn listar(
        &self,
        paginacao: Paginacao,
        empresa_id: Option<Id<Empresa>>,
        oportunidade_id: Option<Id<Oportunidade>>,
        contato_id: Option<Id<Contato>>,
    ) -> Resultado<Pagina<Interacao>> {
        let chave = format!("{paginacao:?}|{empresa_id:?}|{oportunidade_id:?}|{contato_id:?}");
        if let Some(p) = self.cache_listas.get(&chave) {
            return Ok(p);
        }

        let mut count_qb =
            QueryBuilder::<Postgres>::new("SELECT COUNT(*) FROM interacoes WHERE TRUE");
        push_filtro_interacoes(&mut count_qb, &empresa_id, &oportunidade_id, &contato_id);

        let mut qb =
            QueryBuilder::<Postgres>::new(&format!("SELECT {INT_COLS} FROM interacoes WHERE TRUE"));
        push_filtro_interacoes(&mut qb, &empresa_id, &oportunidade_id, &contato_id);
        qb.push(" ORDER BY ocorrido_em DESC LIMIT ")
            .push_bind(paginacao.limite())
            .push(" OFFSET ")
            .push_bind(paginacao.offset());
        let (total_res, rows_res) = tokio::join!(
            count_qb.build_query_as::<(i64,)>().fetch_one(&self.pool),
            qb.build_query_as::<InteracaoRow>().fetch_all(&self.pool),
        );
        let (total,) = total_res.map_err(erro_db(CTX_INT))?;
        let rows = rows_res.map_err(erro_db(CTX_INT))?;

        let itens = rows
            .into_iter()
            .map(map_interacao)
            .collect::<Resultado<Vec<_>>>()?;
        let pagina = Pagina::nova(itens, total, paginacao);
        self.cache_listas.set(chave, pagina.clone());
        Ok(pagina)
    }
}

fn push_filtro_interacoes<'a>(
    qb: &mut QueryBuilder<'a, Postgres>,
    empresa_id: &'a Option<Id<Empresa>>,
    oportunidade_id: &'a Option<Id<Oportunidade>>,
    contato_id: &'a Option<Id<Contato>>,
) {
    if let Some(id) = empresa_id {
        qb.push(" AND empresa_id = ").push_bind(id.valor());
    }
    if let Some(id) = oportunidade_id {
        qb.push(" AND oportunidade_id = ").push_bind(id.valor());
    }
    if let Some(id) = contato_id {
        qb.push(" AND contato_id = ").push_bind(id.valor());
    }
}

// ---------------------------------------------------------------------------
// Orçamentos
// ---------------------------------------------------------------------------

const CTX_ORC: &str = "orcamentos";
const ORC_COLS: &str =
    "id, public_id, numero, empresa_id, contato_id, oportunidade_id, vendedor_id, \
    status, emitido_em, valido_ate, subtotal, desconto, frete, total, \
    condicao_pagamento, observacoes, convertido_pedido_id, created_at, updated_at";
const ORC_ITEM_COLS: &str =
    "id, orcamento_id, produto_id, descricao, quantidade, preco_unitario, desconto, total";

#[derive(FromRow)]
struct OrcamentoRow {
    id: i64,
    public_id: uuid::Uuid,
    numero: String,
    empresa_id: i64,
    contato_id: Option<i64>,
    oportunidade_id: Option<i64>,
    vendedor_id: i64,
    status: String,
    emitido_em: DateTime<Utc>,
    valido_ate: Option<NaiveDate>,
    subtotal: Decimal,
    desconto: Decimal,
    frete: Decimal,
    total: Decimal,
    condicao_pagamento: Option<String>,
    observacoes: Option<String>,
    convertido_pedido_id: Option<i64>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl TryFrom<OrcamentoRow> for Orcamento {
    type Error = hweld_domain::ErroDominio;

    fn try_from(r: OrcamentoRow) -> Result<Self, Self::Error> {
        Ok(Self {
            id: Id::novo(r.id),
            public_id: r.public_id,
            numero: r.numero,
            empresa_id: Id::novo(r.empresa_id),
            contato_id: r.contato_id.map(Id::novo),
            oportunidade_id: r.oportunidade_id.map(Id::novo),
            vendedor_id: Id::novo(r.vendedor_id),
            status: r.status.parse()?,
            emitido_em: r.emitido_em,
            valido_ate: r.valido_ate,
            subtotal: Dinheiro::novo(r.subtotal),
            desconto: Dinheiro::novo(r.desconto),
            frete: Dinheiro::novo(r.frete),
            total: Dinheiro::novo(r.total),
            condicao_pagamento: r.condicao_pagamento,
            observacoes: r.observacoes,
            convertido_pedido_id: r.convertido_pedido_id.map(Id::novo),
            created_at: r.created_at,
            updated_at: r.updated_at,
        })
    }
}

fn map_orcamento(r: OrcamentoRow) -> Resultado<Orcamento> {
    Orcamento::try_from(r).map_err(ErroApp::Dominio)
}

#[derive(FromRow)]
struct OrcamentoItemRow {
    id: i64,
    orcamento_id: i64,
    produto_id: i64,
    descricao: String,
    quantidade: Decimal,
    preco_unitario: Decimal,
    desconto: Decimal,
    total: Decimal,
}

impl TryFrom<OrcamentoItemRow> for OrcamentoItem {
    type Error = hweld_domain::ErroDominio;

    fn try_from(r: OrcamentoItemRow) -> Result<Self, Self::Error> {
        Ok(Self {
            id: Id::novo(r.id),
            orcamento_id: Id::novo(r.orcamento_id),
            produto_id: Id::novo(r.produto_id),
            descricao: r.descricao,
            quantidade: hweld_domain::shared::dinheiro::Quantidade::nova(r.quantidade)?,
            preco_unitario: Dinheiro::novo(r.preco_unitario),
            desconto: Dinheiro::novo(r.desconto),
            total: Dinheiro::novo(r.total),
        })
    }
}

fn map_orcamento_item(r: OrcamentoItemRow) -> Resultado<OrcamentoItem> {
    OrcamentoItem::try_from(r).map_err(ErroApp::Dominio)
}

pub struct RepositorioOrcamentosPg {
    pool: PgPool,
    cache_listas: CacheListas<Pagina<Orcamento>>,
}

impl RepositorioOrcamentosPg {
    pub fn novo(pool: PgPool) -> Self {
        Self {
            pool,
            cache_listas: CacheListas::novo("orcamentos"),
        }
    }
}

async fn inserir_itens_orcamento_tx(
    tx: &mut sqlx::Transaction<'_, Postgres>,
    orcamento_id: Id<Orcamento>,
    itens: &[ItemOrcamentoNovo],
) -> Resultado<()> {
    for item in itens {
        sqlx::query(
            "INSERT INTO orcamento_itens (orcamento_id, produto_id, descricao, quantidade, \
             preco_unitario, desconto, total) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        )
        .bind(orcamento_id.valor())
        .bind(item.produto_id.valor())
        .bind(&item.descricao)
        .bind(item.quantidade.valor())
        .bind(item.preco_unitario.valor())
        .bind(item.desconto.valor())
        .bind(item.total().valor())
        .execute(&mut **tx)
        .await
        .map_err(erro_db(CTX_ORC))?;
    }
    Ok(())
}

#[async_trait]
impl RepositorioOrcamentos for RepositorioOrcamentosPg {
    async fn buscar_por_id(&self, id: Id<Orcamento>) -> Resultado<Option<Orcamento>> {
        let row = sqlx::query_as::<_, OrcamentoRow>(&format!(
            "SELECT {ORC_COLS} FROM orcamentos WHERE id = $1"
        ))
        .bind(id.valor())
        .fetch_optional(&self.pool)
        .await
        .map_err(erro_db(CTX_ORC))?;
        row.map(map_orcamento).transpose()
    }

    async fn buscar_por_public_id(&self, public_id: uuid::Uuid) -> Resultado<Option<Orcamento>> {
        let row = sqlx::query_as::<_, OrcamentoRow>(&format!(
            "SELECT {ORC_COLS} FROM orcamentos WHERE public_id = $1"
        ))
        .bind(public_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(erro_db(CTX_ORC))?;
        row.map(map_orcamento).transpose()
    }

    async fn buscar_itens(&self, orcamento_id: Id<Orcamento>) -> Resultado<Vec<OrcamentoItem>> {
        let rows = sqlx::query_as::<_, OrcamentoItemRow>(&format!(
            "SELECT {ORC_ITEM_COLS} FROM orcamento_itens WHERE orcamento_id = $1 ORDER BY id"
        ))
        .bind(orcamento_id.valor())
        .fetch_all(&self.pool)
        .await
        .map_err(erro_db(CTX_ORC))?;
        rows.into_iter().map(map_orcamento_item).collect()
    }

    async fn listar(
        &self,
        paginacao: Paginacao,
        filtro: FiltroOrcamentos,
    ) -> Resultado<Pagina<Orcamento>> {
        let chave = chave_lista(&paginacao, &filtro);
        if let Some(p) = self.cache_listas.get(&chave) {
            return Ok(p);
        }

        let mut count_qb =
            QueryBuilder::<Postgres>::new("SELECT COUNT(*) FROM orcamentos WHERE TRUE");
        push_filtro_orcamentos(&mut count_qb, &filtro);

        let mut qb =
            QueryBuilder::<Postgres>::new(&format!("SELECT {ORC_COLS} FROM orcamentos WHERE TRUE"));
        push_filtro_orcamentos(&mut qb, &filtro);
        qb.push(" ORDER BY id DESC LIMIT ")
            .push_bind(paginacao.limite())
            .push(" OFFSET ")
            .push_bind(paginacao.offset());
        let (total_res, rows_res) = tokio::join!(
            count_qb.build_query_as::<(i64,)>().fetch_one(&self.pool),
            qb.build_query_as::<OrcamentoRow>().fetch_all(&self.pool),
        );
        let (total,) = total_res.map_err(erro_db(CTX_ORC))?;
        let rows = rows_res.map_err(erro_db(CTX_ORC))?;

        let itens = rows
            .into_iter()
            .map(map_orcamento)
            .collect::<Resultado<Vec<_>>>()?;
        let pagina = Pagina::nova(itens, total, paginacao);
        self.cache_listas.set(chave, pagina.clone());
        Ok(pagina)
    }

    /// Orçamento + itens + número sequencial na mesma transação.
    async fn criar(&self, input: OrcamentoInput) -> Resultado<Orcamento> {
        let mut tx = self.pool.begin().await.map_err(erro_db(CTX_ORC))?;
        let numero = proximo_numero(&mut tx, TipoDocumento::Orcamento).await?;

        let totais = hweld_domain::crm::orcamento::calcular_totais(
            input.itens.iter().map(ItemOrcamentoNovo::total),
            input.desconto,
            input.frete,
        );

        let row = sqlx::query_as::<_, OrcamentoRow>(&format!(
            "INSERT INTO orcamentos (numero, empresa_id, contato_id, oportunidade_id, \
             vendedor_id, status, valido_ate, subtotal, desconto, frete, total, \
             condicao_pagamento, observacoes) \
             VALUES ($1,$2,$3,$4,$5,'rascunho',$6,$7,$8,$9,$10,$11,$12) RETURNING {ORC_COLS}"
        ))
        .bind(&numero)
        .bind(input.empresa_id.valor())
        .bind(input.contato_id.map(|i| i.valor()))
        .bind(input.oportunidade_id.map(|i| i.valor()))
        .bind(input.vendedor_id.valor())
        .bind(input.valido_ate)
        .bind(totais.subtotal.valor())
        .bind(totais.desconto.valor())
        .bind(totais.frete.valor())
        .bind(totais.total.valor())
        .bind(&input.condicao_pagamento)
        .bind(&input.observacoes)
        .fetch_one(&mut *tx)
        .await
        .map_err(erro_db(CTX_ORC))?;
        let orcamento = map_orcamento(row)?;

        inserir_itens_orcamento_tx(&mut tx, orcamento.id, &input.itens).await?;
        tx.commit().await.map_err(erro_db(CTX_ORC))?;
        invalidar_listas();
        Ok(orcamento)
    }

    /// Troca os itens do rascunho: delete + insert + recálculo dos totais
    /// na mesma transação — nunca um orçamento sem itens visível.
    async fn atualizar_itens(
        &self,
        id: Id<Orcamento>,
        itens: Vec<ItemOrcamentoNovo>,
        desconto: Dinheiro,
        frete: Dinheiro,
    ) -> Resultado<Orcamento> {
        let mut tx = self.pool.begin().await.map_err(erro_db(CTX_ORC))?;
        sqlx::query("DELETE FROM orcamento_itens WHERE orcamento_id = $1")
            .bind(id.valor())
            .execute(&mut *tx)
            .await
            .map_err(erro_db(CTX_ORC))?;
        inserir_itens_orcamento_tx(&mut tx, id, &itens).await?;

        let totais = hweld_domain::crm::orcamento::calcular_totais(
            itens.iter().map(ItemOrcamentoNovo::total),
            desconto,
            frete,
        );
        let row = sqlx::query_as::<_, OrcamentoRow>(&format!(
            "UPDATE orcamentos SET subtotal=$2, desconto=$3, frete=$4, total=$5, \
             updated_at=now() WHERE id=$1 RETURNING {ORC_COLS}"
        ))
        .bind(id.valor())
        .bind(totais.subtotal.valor())
        .bind(totais.desconto.valor())
        .bind(totais.frete.valor())
        .bind(totais.total.valor())
        .fetch_one(&mut *tx)
        .await
        .map_err(erro_db(CTX_ORC))?;
        let orcamento = map_orcamento(row)?;
        tx.commit().await.map_err(erro_db(CTX_ORC))?;
        invalidar_listas();
        Ok(orcamento)
    }

    async fn atualizar_status(
        &self,
        id: Id<Orcamento>,
        status: StatusOrcamento,
    ) -> Resultado<Orcamento> {
        let row = sqlx::query_as::<_, OrcamentoRow>(&format!(
            "UPDATE orcamentos SET status=$2, updated_at=now() WHERE id=$1 RETURNING {ORC_COLS}"
        ))
        .bind(id.valor())
        .bind(status.as_str())
        .fetch_one(&self.pool)
        .await
        .map_err(erro_db(CTX_ORC))?;
        let orcamento = map_orcamento(row)?;
        invalidar_listas();
        Ok(orcamento)
    }

    /// Job: expira orçamentos cuja validade passou (exceto terminais).
    async fn expirar_vencidos(&self, hoje: NaiveDate) -> Resultado<Vec<Id<Orcamento>>> {
        let rows: Vec<(i64,)> = sqlx::query_as(
            "UPDATE orcamentos SET status='expirado', updated_at=now() \
             WHERE valido_ate < $1 AND status IN ('enviado','em_analise','aprovado') \
             RETURNING id",
        )
        .bind(hoje)
        .fetch_all(&self.pool)
        .await
        .map_err(erro_db(CTX_ORC))?;
        if !rows.is_empty() {
            invalidar_listas();
        }
        Ok(rows.into_iter().map(|(id,)| Id::novo(id)).collect())
    }

    /// Conversão atômica (§7.1): cria o pedido e marca o orçamento
    /// `convertido` na mesma transação — UNIQUE em `orcamento_id` e
    /// `convertido_pedido_id` garante que uma segunda tentativa é 409.
    async fn converter_em_pedido(
        &self,
        orcamento_id: Id<Orcamento>,
        pedido: NovoPedido,
    ) -> Resultado<Pedido> {
        let mut tx = self.pool.begin().await.map_err(erro_db(CTX_ORC))?;

        // Idempotência: orçamento já convertido retorna o pedido existente.
        let existente: Option<i64> = sqlx::query_scalar(
            "SELECT convertido_pedido_id FROM orcamentos WHERE id = $1 FOR UPDATE",
        )
        .bind(orcamento_id.valor())
        .fetch_optional(&mut *tx)
        .await
        .map_err(erro_db(CTX_ORC))?
        .flatten();
        if let Some(pedido_id) = existente {
            let row = sqlx::query_as::<_, super::vendas::PedidoRow>(&format!(
                "SELECT {} FROM pedidos WHERE id = $1",
                super::vendas::PED_COLS
            ))
            .bind(pedido_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(erro_db(CTX_ORC))?;
            let p = super::vendas::map_pedido(row)?;
            tx.commit().await.map_err(erro_db(CTX_ORC))?;
            return Ok(p);
        }

        let salvo = inserir_pedido_tx(&mut tx, &pedido).await?;
        sqlx::query(
            "UPDATE orcamentos SET status='convertido', convertido_pedido_id=$2, \
             updated_at=now() WHERE id=$1",
        )
        .bind(orcamento_id.valor())
        .bind(salvo.id.valor())
        .execute(&mut *tx)
        .await
        .map_err(erro_db(CTX_ORC))?;
        tx.commit().await.map_err(erro_db(CTX_ORC))?;
        invalidar_listas();
        Ok(salvo)
    }
}

fn push_filtro_orcamentos<'a>(qb: &mut QueryBuilder<'a, Postgres>, filtro: &'a FiltroOrcamentos) {
    if let Some(status) = filtro.status {
        qb.push(" AND status = ").push_bind(status.as_str());
    }
    if let Some(empresa_id) = filtro.empresa_id {
        qb.push(" AND empresa_id = ").push_bind(empresa_id.valor());
    }
    if let Some(oportunidade_id) = filtro.oportunidade_id {
        qb.push(" AND oportunidade_id = ")
            .push_bind(oportunidade_id.valor());
    }
    if let Some(vendedor_id) = filtro.vendedor_id {
        qb.push(" AND vendedor_id = ")
            .push_bind(vendedor_id.valor());
    }
}

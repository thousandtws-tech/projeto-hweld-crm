//! `notas_fiscais` + `nota_fiscal_itens` — documentos fiscais (§4.16).
//! `autorizada`/`cancelada` só via eventos fiscais — nunca edição livre.

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use hweld_application::ports::externos::AutorizacaoFiscal;
use hweld_application::ports::fiscal::{
    FiltroNotasFiscais, NovaNotaFiscal, NovoItemNf, RepositorioNotasFiscais,
};
use hweld_application::{ErroApp, Resultado};
use hweld_domain::fiscal::nota_fiscal::{NotaFiscal, NotaFiscalItem, StatusNotaFiscal};
use hweld_domain::shared::dinheiro::{Dinheiro, Quantidade};
use hweld_domain::shared::documento::TipoDocumento;
use hweld_domain::shared::id::Id;
use hweld_domain::shared::paginacao::{Pagina, Paginacao};
use rust_decimal::Decimal;
use sqlx::{FromRow, PgPool, Postgres, QueryBuilder};

use super::cache::{chave_lista, invalidar_listas, CacheListas};
use super::db::{erro_db, proximo_numero};

const CTX: &str = "notas_fiscais";
const NF_COLS: &str = "id, numero, serie, chave_acesso, pedido_id, empresa_id, tipo, \
    status, natureza_operacao, cfop, emitida_em, valor_produtos, valor_frete, \
    valor_desconto, valor_total, protocolo_autorizacao, xml_path, pdf_path, \
    motivo_cancelamento, created_at, updated_at";
const NF_ITEM_COLS: &str = "id, nf_id, produto_id, codigo, descricao, ncm, cfop, unidade, \
    quantidade, valor_unitario, valor_total, icms_aliquota, icms_valor, ipi_aliquota, \
    ipi_valor, pis_valor, cofins_valor";

#[derive(FromRow)]
struct NfRow {
    id: i64,
    numero: String,
    serie: Option<String>,
    chave_acesso: Option<String>,
    pedido_id: i64,
    empresa_id: i64,
    tipo: String,
    status: String,
    natureza_operacao: Option<String>,
    cfop: Option<String>,
    emitida_em: Option<DateTime<Utc>>,
    valor_produtos: Option<Decimal>,
    valor_frete: Option<Decimal>,
    valor_desconto: Option<Decimal>,
    valor_total: Option<Decimal>,
    protocolo_autorizacao: Option<String>,
    xml_path: Option<String>,
    pdf_path: Option<String>,
    motivo_cancelamento: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl TryFrom<NfRow> for NotaFiscal {
    type Error = hweld_domain::ErroDominio;

    fn try_from(r: NfRow) -> Result<Self, Self::Error> {
        Ok(Self {
            id: Id::novo(r.id),
            numero: r.numero,
            serie: r.serie,
            chave_acesso: r.chave_acesso,
            pedido_id: Id::novo(r.pedido_id),
            empresa_id: Id::novo(r.empresa_id),
            tipo: r.tipo.parse()?,
            status: r.status.parse()?,
            natureza_operacao: r.natureza_operacao,
            cfop: r.cfop,
            emitida_em: r.emitida_em,
            valor_produtos: r.valor_produtos.map(Dinheiro::novo),
            valor_frete: r.valor_frete.map(Dinheiro::novo),
            valor_desconto: r.valor_desconto.map(Dinheiro::novo),
            valor_total: r.valor_total.map(Dinheiro::novo),
            protocolo_autorizacao: r.protocolo_autorizacao,
            xml_path: r.xml_path,
            pdf_path: r.pdf_path,
            motivo_cancelamento: r.motivo_cancelamento,
            created_at: r.created_at,
            updated_at: r.updated_at,
        })
    }
}

fn map_nf(r: NfRow) -> Resultado<NotaFiscal> {
    NotaFiscal::try_from(r).map_err(ErroApp::Dominio)
}

#[derive(FromRow)]
struct NfItemRow {
    id: i64,
    nf_id: i64,
    produto_id: Option<i64>,
    codigo: Option<String>,
    descricao: Option<String>,
    ncm: Option<String>,
    cfop: Option<String>,
    unidade: Option<String>,
    quantidade: Option<Decimal>,
    valor_unitario: Option<Decimal>,
    valor_total: Option<Decimal>,
    icms_aliquota: Option<Decimal>,
    icms_valor: Option<Decimal>,
    ipi_aliquota: Option<Decimal>,
    ipi_valor: Option<Decimal>,
    pis_valor: Option<Decimal>,
    cofins_valor: Option<Decimal>,
}

impl TryFrom<NfItemRow> for NotaFiscalItem {
    type Error = hweld_domain::ErroDominio;

    fn try_from(r: NfItemRow) -> Result<Self, Self::Error> {
        Ok(Self {
            id: Id::novo(r.id),
            nf_id: Id::novo(r.nf_id),
            produto_id: r.produto_id.map(Id::novo),
            codigo: r.codigo,
            descricao: r.descricao,
            ncm: r.ncm,
            cfop: r.cfop,
            unidade: r.unidade,
            quantidade: r.quantidade.map(Quantidade::nova).transpose()?,
            valor_unitario: r.valor_unitario.map(Dinheiro::novo),
            valor_total: r.valor_total.map(Dinheiro::novo),
            icms_aliquota: r.icms_aliquota,
            icms_valor: r.icms_valor.map(Dinheiro::novo),
            ipi_aliquota: r.ipi_aliquota,
            ipi_valor: r.ipi_valor.map(Dinheiro::novo),
            pis_valor: r.pis_valor.map(Dinheiro::novo),
            cofins_valor: r.cofins_valor.map(Dinheiro::novo),
        })
    }
}

pub struct RepositorioNotasFiscaisPg {
    pool: PgPool,
    cache_listas: CacheListas<Pagina<NotaFiscal>>,
}

impl RepositorioNotasFiscaisPg {
    pub fn novo(pool: PgPool) -> Self {
        Self {
            pool,
            cache_listas: CacheListas::novo("notas_fiscais"),
        }
    }
}

async fn inserir_item_nf(
    tx: &mut sqlx::Transaction<'_, Postgres>,
    nf_id: Id<NotaFiscal>,
    item: &NovoItemNf,
) -> Resultado<()> {
    sqlx::query(
        "INSERT INTO nota_fiscal_itens (nf_id, produto_id, codigo, descricao, ncm, cfop, \
         unidade, quantidade, valor_unitario, valor_total, icms_aliquota, icms_valor, \
         ipi_aliquota, ipi_valor, pis_valor, cofins_valor) \
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)",
    )
    .bind(nf_id.valor())
    .bind(item.produto_id.map(|i| i.valor()))
    .bind(&item.codigo)
    .bind(&item.descricao)
    .bind(&item.ncm)
    .bind(&item.cfop)
    .bind(&item.unidade)
    .bind(item.quantidade)
    .bind(item.valor_unitario.map(|v| v.valor()))
    .bind(item.valor_total.map(|v| v.valor()))
    .bind(item.icms_aliquota)
    .bind(item.icms_valor.map(|v| v.valor()))
    .bind(item.ipi_aliquota)
    .bind(item.ipi_valor.map(|v| v.valor()))
    .bind(item.pis_valor.map(|v| v.valor()))
    .bind(item.cofins_valor.map(|v| v.valor()))
    .execute(&mut **tx)
    .await
    .map_err(erro_db(CTX))?;
    Ok(())
}

#[async_trait]
impl RepositorioNotasFiscais for RepositorioNotasFiscaisPg {
    async fn buscar_por_id(&self, id: Id<NotaFiscal>) -> Resultado<Option<NotaFiscal>> {
        let row = sqlx::query_as::<_, NfRow>(&format!(
            "SELECT {NF_COLS} FROM notas_fiscais WHERE id = $1"
        ))
        .bind(id.valor())
        .fetch_optional(&self.pool)
        .await
        .map_err(erro_db(CTX))?;
        row.map(map_nf).transpose()
    }

    async fn buscar_itens(&self, nf_id: Id<NotaFiscal>) -> Resultado<Vec<NotaFiscalItem>> {
        let rows = sqlx::query_as::<_, NfItemRow>(&format!(
            "SELECT {NF_ITEM_COLS} FROM nota_fiscal_itens WHERE nf_id = $1 ORDER BY id"
        ))
        .bind(nf_id.valor())
        .fetch_all(&self.pool)
        .await
        .map_err(erro_db(CTX))?;
        rows.into_iter()
            .map(|r| NotaFiscalItem::try_from(r).map_err(ErroApp::Dominio))
            .collect()
    }

    async fn listar(
        &self,
        paginacao: Paginacao,
        filtro: FiltroNotasFiscais,
    ) -> Resultado<Pagina<NotaFiscal>> {
        let chave = chave_lista(&paginacao, &filtro);
        if let Some(p) = self.cache_listas.get(&chave) {
            return Ok(p);
        }

        let mut count_qb =
            QueryBuilder::<Postgres>::new("SELECT COUNT(*) FROM notas_fiscais WHERE TRUE");
        push_filtro_nf(&mut count_qb, &filtro);

        let mut qb = QueryBuilder::<Postgres>::new(&format!(
            "SELECT {NF_COLS} FROM notas_fiscais WHERE TRUE"
        ));
        push_filtro_nf(&mut qb, &filtro);
        qb.push(" ORDER BY id DESC LIMIT ")
            .push_bind(paginacao.limite())
            .push(" OFFSET ")
            .push_bind(paginacao.offset());
        let (total_res, rows_res) = tokio::join!(
            count_qb.build_query_as::<(i64,)>().fetch_one(&self.pool),
            qb.build_query_as::<NfRow>().fetch_all(&self.pool),
        );
        let (total,) = total_res.map_err(erro_db(CTX))?;
        let rows = rows_res.map_err(erro_db(CTX))?;

        let itens = rows
            .into_iter()
            .map(map_nf)
            .collect::<Resultado<Vec<_>>>()?;
        let pagina = Pagina::nova(itens, total, paginacao);
        self.cache_listas.set(chave, pagina.clone());
        Ok(pagina)
    }

    /// NF + itens + número sequencial na mesma transação — nasce `rascunho`.
    async fn criar(&self, nf: NovaNotaFiscal) -> Resultado<NotaFiscal> {
        let mut tx = self.pool.begin().await.map_err(erro_db(CTX))?;
        let numero = proximo_numero(&mut tx, TipoDocumento::NotaFiscal).await?;

        let row = sqlx::query_as::<_, NfRow>(&format!(
            "INSERT INTO notas_fiscais (numero, serie, pedido_id, empresa_id, tipo, status, \
             natureza_operacao, cfop, valor_produtos, valor_frete, valor_desconto, valor_total) \
             VALUES ($1,$2,$3,$4,$5,'rascunho',$6,$7,$8,$9,$10,$11) RETURNING {NF_COLS}"
        ))
        .bind(&numero)
        .bind(&nf.serie)
        .bind(nf.pedido_id.valor())
        .bind(nf.empresa_id.valor())
        .bind(nf.tipo.as_str())
        .bind(&nf.natureza_operacao)
        .bind(&nf.cfop)
        .bind(nf.valor_produtos.valor())
        .bind(nf.valor_frete.valor())
        .bind(nf.valor_desconto.valor())
        .bind(nf.valor_total.valor())
        .fetch_one(&mut *tx)
        .await
        .map_err(erro_db(CTX))?;
        let nota = map_nf(row)?;

        for item in &nf.itens {
            inserir_item_nf(&mut tx, nota.id, item).await?;
        }
        tx.commit().await.map_err(erro_db(CTX))?;
        invalidar_listas();
        Ok(nota)
    }

    /// Registra a autorização da SEFAZ: chave, protocolo, paths e `emitida_em`.
    /// `chave_acesso` é UNIQUE — re-autorização duplicada vira 409.
    async fn registrar_autorizacao(
        &self,
        id: Id<NotaFiscal>,
        autorizacao: &AutorizacaoFiscal,
    ) -> Resultado<NotaFiscal> {
        let row = sqlx::query_as::<_, NfRow>(&format!(
            "UPDATE notas_fiscais SET status='autorizada', chave_acesso=$2, \
             protocolo_autorizacao=$3, xml_path=$4, pdf_path=$5, emitida_em=now(), \
             updated_at=now() WHERE id=$1 RETURNING {NF_COLS}"
        ))
        .bind(id.valor())
        .bind(&autorizacao.chave_acesso)
        .bind(&autorizacao.protocolo)
        .bind(&autorizacao.xml_path)
        .bind(&autorizacao.pdf_path)
        .fetch_one(&self.pool)
        .await
        .map_err(erro_db(CTX))?;
        let nota = map_nf(row)?;
        invalidar_listas();
        Ok(nota)
    }

    async fn registrar_status(
        &self,
        id: Id<NotaFiscal>,
        status: StatusNotaFiscal,
    ) -> Resultado<NotaFiscal> {
        let row = sqlx::query_as::<_, NfRow>(&format!(
            "UPDATE notas_fiscais SET status=$2, updated_at=now() WHERE id=$1 RETURNING {NF_COLS}"
        ))
        .bind(id.valor())
        .bind(status.as_str())
        .fetch_one(&self.pool)
        .await
        .map_err(erro_db(CTX))?;
        let nota = map_nf(row)?;
        invalidar_listas();
        Ok(nota)
    }

    /// Cancelamento exige motivo — CHECK no banco também garante (§7.3).
    async fn cancelar(&self, id: Id<NotaFiscal>, motivo: &str) -> Resultado<NotaFiscal> {
        let row = sqlx::query_as::<_, NfRow>(&format!(
            "UPDATE notas_fiscais SET status='cancelada', motivo_cancelamento=$2, \
             updated_at=now() WHERE id=$1 RETURNING {NF_COLS}"
        ))
        .bind(id.valor())
        .bind(motivo)
        .fetch_one(&self.pool)
        .await
        .map_err(erro_db(CTX))?;
        let nota = map_nf(row)?;
        invalidar_listas();
        Ok(nota)
    }
}

fn push_filtro_nf<'a>(qb: &mut QueryBuilder<'a, Postgres>, filtro: &'a FiltroNotasFiscais) {
    if let Some(status) = filtro.status {
        qb.push(" AND status = ").push_bind(status.as_str());
    }
    if let Some(empresa_id) = filtro.empresa_id {
        qb.push(" AND empresa_id = ").push_bind(empresa_id.valor());
    }
    if let Some(pedido_id) = filtro.pedido_id {
        qb.push(" AND pedido_id = ").push_bind(pedido_id.valor());
    }
}

// ── Configuração fiscal SEFAZ (linha única id = 1) ──────────────────────────

use chrono::NaiveDate;
use hweld_application::ports::fiscal::RepositorioConfigFiscal;
use hweld_domain::fiscal::configuracao::{ConfigFiscalInput, ConfiguracaoFiscal};

pub struct RepositorioConfigFiscalPg {
    pool: PgPool,
}

impl RepositorioConfigFiscalPg {
    pub fn novo(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[derive(FromRow)]
struct ConfigFiscalRow {
    ambiente: String,
    serie_nf: Option<String>,
    regime_tributario: Option<String>,
    csc_id: Option<String>,
    csc_token: Option<String>,
    certificado_senha: Option<String>,
    certificado_nome: Option<String>,
    certificado_validade: Option<NaiveDate>,
    certificado_sha256: Option<String>,
    certificado_presente: bool,
    updated_at: DateTime<Utc>,
}

const CONFIG_COLS: &str = "ambiente, serie_nf, regime_tributario, csc_id, csc_token, \
    certificado_senha, certificado_nome, certificado_validade, certificado_sha256, \
    (certificado_pfx IS NOT NULL) AS certificado_presente, updated_at";

fn map_config(r: ConfigFiscalRow) -> Resultado<ConfiguracaoFiscal> {
    Ok(ConfiguracaoFiscal {
        ambiente: r.ambiente.parse().map_err(ErroApp::Dominio)?,
        serie_nf: r.serie_nf,
        regime_tributario: r.regime_tributario,
        csc_id: r.csc_id,
        csc_token: r.csc_token,
        certificado_senha: r.certificado_senha,
        certificado_configurado: r.certificado_presente,
        certificado_nome: r.certificado_nome,
        certificado_validade: r.certificado_validade,
        certificado_sha256: r.certificado_sha256,
        updated_at: r.updated_at,
    })
}

#[async_trait]
impl RepositorioConfigFiscal for RepositorioConfigFiscalPg {
    async fn buscar(&self) -> Resultado<ConfiguracaoFiscal> {
        // Garante a linha única mesmo se a migration 0012 ainda não semeou.
        sqlx::query("INSERT INTO configuracao_fiscal (id) VALUES (1) ON CONFLICT (id) DO NOTHING")
            .execute(&self.pool)
            .await
            .map_err(erro_db(CTX))?;
        let row = sqlx::query_as::<_, ConfigFiscalRow>(&format!(
            "SELECT {CONFIG_COLS} FROM configuracao_fiscal WHERE id = 1"
        ))
        .fetch_one(&self.pool)
        .await
        .map_err(erro_db(CTX))?;
        map_config(row)
    }

    async fn salvar(&self, input: ConfigFiscalInput) -> Resultado<ConfiguracaoFiscal> {
        // Segredos usam "ausente = mantém": csc_token Some("") limpa, None preserva.
        let atualiza_csc = input.csc_token.is_some();
        let csc_token = input.csc_token.filter(|t| !t.is_empty());
        sqlx::query(
            "UPDATE configuracao_fiscal SET \
                ambiente           = COALESCE($1, ambiente), \
                serie_nf           = COALESCE($2, serie_nf), \
                regime_tributario  = COALESCE($3, regime_tributario), \
                csc_id             = COALESCE($4, csc_id), \
                csc_token          = CASE WHEN $5 THEN $6 ELSE csc_token END, \
                updated_at         = now() \
             WHERE id = 1",
        )
        .bind(input.ambiente.map(|a| a.as_str()))
        .bind(input.serie_nf)
        .bind(input.regime_tributario)
        .bind(input.csc_id)
        .bind(atualiza_csc)
        .bind(csc_token)
        .execute(&self.pool)
        .await
        .map_err(erro_db(CTX))?;
        self.buscar().await
    }

    async fn gravar_certificado(
        &self,
        pfx: &[u8],
        nome: &str,
        senha: Option<&str>,
        validade: Option<NaiveDate>,
        sha256: &str,
    ) -> Resultado<()> {
        sqlx::query(
            "UPDATE configuracao_fiscal SET \
                certificado_pfx = $1, certificado_nome = $2, certificado_senha = $3, \
                certificado_validade = $4, certificado_sha256 = $5, updated_at = now() \
             WHERE id = 1",
        )
        .bind(pfx)
        .bind(nome)
        .bind(senha)
        .bind(validade)
        .bind(sha256)
        .execute(&self.pool)
        .await
        .map_err(erro_db(CTX))?;
        Ok(())
    }

    async fn remover_certificado(&self) -> Resultado<()> {
        sqlx::query(
            "UPDATE configuracao_fiscal SET \
                certificado_pfx = NULL, certificado_nome = NULL, certificado_senha = NULL, \
                certificado_validade = NULL, certificado_sha256 = NULL, updated_at = now() \
             WHERE id = 1",
        )
        .execute(&self.pool)
        .await
        .map_err(erro_db(CTX))?;
        Ok(())
    }

    async fn certificado(&self) -> Resultado<Option<(Vec<u8>, Option<String>)>> {
        let row = sqlx::query_as::<_, (Option<Vec<u8>>, Option<String>)>(
            "SELECT certificado_pfx, certificado_senha FROM configuracao_fiscal WHERE id = 1",
        )
        .fetch_one(&self.pool)
        .await
        .map_err(erro_db(CTX))?;
        Ok(row.0.map(|pfx| (pfx, row.1)))
    }
}

#!/usr/bin/env python3
"""Teste de busca (Elasticsearch) — cobre TODAS as capacidades:

  - full-text com relevância (multi_match best_fields)
  - tolerância a erro de digitação (fuzziness AUTO)
  - normalização de acentos (asciifolding)
  - filtros por categoria, marca e faixa de preço (contexto filter)
  - facetas com contagens em tempo real (terms + stats aggs)
  - autocomplete (search_as_you_type + bool_prefix)
  - paginação
  - produtos inativos: staff vê, portal não
  - RBAC: portal não acessa busca staff; só Admin reindexa
  - sincronização do índice: PUT /produtos reflete na busca

Uso: python scripts/busca_test.py [base_url]
Requer: servidor com ELASTICSEARCH_URL + admin semeado (ADMIN_SENHA).
Reexecutável: recursos existentes são localizados em vez de recriados.
"""

import json
import sys
import urllib.error
import urllib.request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"
ADMIN_EMAIL = "admin@hweld.local"
ADMIN_SENHA = "admin123"

falhas = []


def req(metodo, path, body=None, token=None, esperado=None, silencioso=False):
    url = f"{BASE}{path}"
    dados = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=dados, method=metodo)
    r.add_header("Content-Type", "application/json")
    if token:
        r.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(r) as resp:
            status, payload = resp.status, resp.read()
    except urllib.error.HTTPError as e:
        status, payload = e.code, e.read()
    try:
        corpo = json.loads(payload) if payload else None
    except json.JSONDecodeError:
        corpo = {"raw": payload.decode(errors="replace")[:200]}
    marca = "ok" if esperado is None or status == esperado else "FALHOU"
    if marca == "FALHOU":
        falhas.append((metodo, path, status, esperado, corpo))
    if not silencioso or marca == "FALHOU":
        print(f"[{status}] {metodo} {path} {marca}")
    if marca == "FALHOU":
        print("      ->", json.dumps(corpo, ensure_ascii=False)[:300])
    return status, corpo


def checa(descricao, cond, detalhe=""):
    marca = "ok" if cond else "FALHOU"
    if not cond:
        falhas.append(("assert", descricao, "-", "verdadeiro", detalhe))
    print(f"      assert: {descricao} {marca}")


# ── Tokens ──────────────────────────────────────────────────────────────────
_, login = req("POST", "/api/v1/auth/staff/login",
               {"email": ADMIN_EMAIL, "senha": ADMIN_SENHA}, esperado=200)
token = login["access_token"]

# Empresa + contato + portal (reusa quando já existe)
st, emp = req("POST", "/api/v1/empresas", token=token, body={
    "razao_social": "Metalúrgica Fumaça LTDA", "cnpj": "11.222.333/0001-81",
    "status": "ativo"})
if st == 409:
    _, p = req("GET", "/api/v1/empresas?busca=Metal", token=token, esperado=200)
    emp_id = p["itens"][0]["id"]
else:
    emp_id = emp["id"]

st, ct = req("POST", "/api/v1/contatos", token=token, body={
    "empresa_id": emp_id, "nome": "Comprador Portal",
    "email": "comprador@metal.com", "is_principal": True,
    "acesso_portal": True})
if st == 409:
    _, p = req("GET", f"/api/v1/contatos?empresa_id={emp_id}", token=token,
               esperado=200)
    ct_id = p["itens"][0]["id"]
else:
    ct_id = ct["id"]
req("POST", f"/api/v1/contatos/{ct_id}/portal", token=token,
    body={"senha": "portal123"}, esperado=204)

_, lp = req("POST", "/api/v1/auth/portal/login",
            {"email": "comprador@metal.com", "senha": "portal123"}, esperado=200)
ptoken = lp["access_token"]

# ── Categorias ──────────────────────────────────────────────────────────────
def garantir_categoria(nome, ordem):
    st, c = req("POST", "/api/v1/categorias", token=token,
                body={"nome": nome, "ordem": ordem, "ativa": True},
                silencioso=True)
    if st == 409:
        _, cats = req("GET", "/api/v1/categorias?somente_ativas=false",
                      token=token, esperado=200)
        return next(c["id"] for c in cats if c["nome"] == nome)
    assert st == 201, f"categoria {nome}: {c}"
    return c["id"]

cat_soldas = garantir_categoria("Soldas", 1)
cat_ferramentas = garantir_categoria("Ferramentas", 2)
cat_epis = garantir_categoria("EPIs", 3)
print(f"      categorias: soldas={cat_soldas} ferramentas={cat_ferramentas} epis={cat_epis}")

# ── Produtos variados ───────────────────────────────────────────────────────
PRODUTOS = [
    ("SOLDA-E7018", "Eletrodo E7018 2,5mm Pro", cat_soldas, "ESAB", "25.90"),
    ("SOLDA-E6013", "Eletrodo E6013 3,25mm", cat_soldas, "ESAB", "22.50"),
    ("MIG-ER70S6", "Arame MIG ER70S-6 0,8mm", cat_soldas, "ESAB", "89.90"),
    ("TIG-HW17", "Tocha TIG HW-17 Completa", cat_soldas, "WeldBras", "450.00"),
    ("ESM-412", "Esmerilhadeira Angular 4.1/2 850W", cat_ferramentas, "Bosch", "289.90"),
    ("DISCO-115", "Disco de Corte Inox 115mm", cat_ferramentas, "Bosch", "8.90"),
    ("MASC-AUTO", "Máscara de Solda Automática", cat_epis, "ESAB", "349.00"),
    ("LUVA-TIG", "Luva TIG Couro Cano Longo", cat_epis, "Vonder", "45.90"),
]

ids = {}
for sku, nome, cat, marca, preco in PRODUTOS:
    body = {"sku": sku, "nome": nome, "categoria_id": cat, "marca": marca,
            "preco_venda": preco, "controla_estoque": True, "ativo": True,
            "destaque": False}
    st, p = req("POST", "/api/v1/produtos", token=token, body=body, silencioso=True)
    if st == 409:
        _, pg = req("GET", f"/api/v1/produtos?busca={sku}", token=token,
                    esperado=200, silencioso=True)
        ids[sku] = pg["itens"][0]["id"]
    else:
        assert st == 201, f"produto {sku}: {p}"
        ids[sku] = p["id"]
print(f"      produtos: {len(ids)} no catálogo")

# Produto inativo — staff deve ver na busca, portal não.
st, p = req("POST", "/api/v1/produtos", token=token, body={
    "sku": "SUCATA-INAT", "nome": "Sucata Teste Inativo",
    "categoria_id": cat_soldas, "preco_venda": "1.00",
    "controla_estoque": False, "ativo": False, "destaque": False},
    silencioso=True)
if st == 409:
    _, pg = req("GET", "/api/v1/produtos?busca=SUCATA-INAT", token=token,
                esperado=200, silencioso=True)
    inativo_id = pg["itens"][0]["id"]
else:
    inativo_id = p["id"]

# ── Reindexação completa ────────────────────────────────────────────────────
_, reix = req("POST", "/api/v1/busca/reindexar", token=token, esperado=200)
print(f"      reindexados: {reix['indexados']}")

print()
print("== Full-text + relevância ==")
_, r = req("GET", "/api/v1/portal/busca/produtos?q=eletrodo",
           token=ptoken, esperado=200)
nomes = [i["nome"] for i in r["itens"]]
checa("'eletrodo' retorna os eletrodos (≥2)",
      sum("Eletrodo" in n for n in nomes) >= 2, nomes)

print()
print("== Fuzzy (erro de digitação) ==")
for termo in ("eletrodu", "elletrodo", "esmerilhdeira"):
    _, r = req("GET", f"/api/v1/portal/busca/produtos?q={termo}",
               token=ptoken, esperado=200)
    checa(f"'{termo}' ainda encontra produto(s)", r["total"] >= 1,
          r["itens"][:1])

print()
print("== Acentos (asciifolding) ==")
_, r = req("GET", "/api/v1/portal/busca/produtos?q=macara",
           token=ptoken, esperado=200)
checa("'macara' (sem acento) encontra 'Máscara'",
      any("Máscara" in i["nome"] for i in r["itens"]), r["itens"][:1])

print()
print("== Filtros (filter context) ==")
_, r = req("GET", f"/api/v1/portal/busca/produtos?categoria_id={cat_soldas}",
           token=ptoken, esperado=200)
checa("filtro categoria=Soldas (sem texto) retorna ≥4", r["total"] >= 4)

_, r = req("GET", "/api/v1/portal/busca/produtos?marca=ESAB",
           token=ptoken, esperado=200)
checa("filtro marca=ESAB retorna 4", r["total"] == 4, r["total"])

_, r = req("GET",
           "/api/v1/portal/busca/produtos?preco_min=40&preco_max=100",
           token=ptoken, esperado=200)
precos = [float(i["preco_efetivo"]) for i in r["itens"]]
checa("faixa 40–100 só traz preços dentro", all(40 <= p <= 100 for p in precos)
      and r["total"] >= 2, precos)

_, r = req("GET", "/api/v1/portal/busca/produtos?q=solda&marca=ESAB",
           token=ptoken, esperado=200)
checa("texto + filtro combinados (solda & ESAB → Máscara de Solda)",
      any("Solda" in i["nome"] for i in r["itens"]) and r["total"] >= 1,
      [i["nome"] for i in r["itens"]])

print()
print("== Facetas (aggs em tempo real) ==")
_, r = req("GET", "/api/v1/portal/busca/produtos", token=ptoken, esperado=200)
marcas = {f["valor"]: f["contagem"] for f in r["facetas"]["marcas"]}
checa("faceta marca ESAB com contagem=4", marcas.get("ESAB") == 4, marcas)
cats = {f["rotulo"]: f["contagem"] for f in r["facetas"]["categorias"]}
checa("faceta categoria 'Soldas' rotulada e contagem≥4",
      cats.get("Soldas", 0) >= 4, cats)
checa("faixa de preço das facetas: min=8.90 max=450",
      r["facetas"]["preco_min"] == "8.9" and r["facetas"]["preco_max"] == "450",
      r["facetas"])

_, r = req("GET", f"/api/v1/portal/busca/produtos?categoria_id={cat_ferramentas}",
           token=ptoken, esperado=200)
checa("facetas recalculam com o filtro aplicado",
      r["facetas"]["categorias"][0]["contagem"] == 2, r["facetas"]["categorias"])

print()
print("== Autocomplete ==")
for pref, espera in (("ele", "Eletrodo"), ("mig", "Arame MIG"), ("masc", "Máscara")):
    _, s = req("GET", f"/api/v1/portal/busca/sugestoes?q={pref}",
               token=ptoken, esperado=200)
    checa(f"prefixo '{pref}' sugere '{espera}'",
          any(espera in x["nome"] for x in s), s[:2])

_, s = req("GET", "/api/v1/portal/busca/sugestoes?q=e",
           token=ptoken, esperado=200)
checa("prefixo de 1 char retorna vazio (mínimo 2)", s == [], s)

print()
print("== Paginação ==")
_, r1 = req("GET", "/api/v1/portal/busca/produtos?por_pagina=3&pagina=1",
            token=ptoken, esperado=200)
_, r2 = req("GET", "/api/v1/portal/busca/produtos?por_pagina=3&pagina=2",
            token=ptoken, esperado=200)
checa("página 1 e 2 não repetem itens",
      {i["id"] for i in r1["itens"]}.isdisjoint(i["id"] for i in r2["itens"]))
checa("total consistente entre páginas", r1["total"] == r2["total"] >= 8,
      r1["total"])

print()
print("== Visibilidade staff vs portal ==")
_, r = req("GET", "/api/v1/busca/produtos?q=sucata", token=token, esperado=200)
checa("staff encontra produto inativo", r["total"] == 1)
_, r = req("GET", "/api/v1/portal/busca/produtos?q=sucata",
           token=ptoken, esperado=200)
checa("portal NÃO encontra produto inativo", r["total"] == 0)

print()
print("== RBAC ==")
req("GET", "/api/v1/busca/produtos?q=eletrodo", token=ptoken, esperado=401)
req("GET", "/api/v1/portal/busca/produtos?q=eletrodo", esperado=401)
_, lv = req("POST", "/api/v1/auth/staff/login",
            {"email": "vendedor@hweld.local", "senha": "vend12345"})
if lv and "access_token" in lv:
    req("POST", "/api/v1/busca/reindexar", token=lv["access_token"],
        esperado=403)

print()
print("== Sync do índice (best-effort pós-commit) ==")
novo_nome = "Eletrodo E7018 2,5mm RUTILO PREMIUM"
req("PATCH", f"/api/v1/produtos/{ids['SOLDA-E7018']}", token=token,
    body={"sku": "SOLDA-E7018", "nome": novo_nome,
          "categoria_id": cat_soldas, "marca": "ESAB",
          "preco_venda": "25.90", "controla_estoque": True,
          "ativo": True, "destaque": False}, esperado=200)
_, r = req("GET", "/api/v1/portal/busca/produtos?q=rutilo",
           token=ptoken, esperado=200)
checa("update reflete na busca imediatamente (refresh=wait_for)",
      any("RUTILO" in i["nome"] for i in r["itens"]), r["itens"][:1])

# ── Resumo ──────────────────────────────────────────────────────────────────
print()
if falhas:
    print(f"{len(falhas)} FALHA(S):")
    for f in falhas:
        print("  ", f[0], f[1], "->", f[2], "(esperado", f[3], ")")
    sys.exit(1)
print("Teste de busca concluído sem falhas.")

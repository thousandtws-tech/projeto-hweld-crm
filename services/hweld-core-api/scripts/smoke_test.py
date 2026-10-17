#!/usr/bin/env python3
"""Smoke test do backend HWeld — exercita auth, CRUD, checkout, caixa.

Uso: python scripts/smoke_test.py [base_url]
Requer: servidor rodando com SEED_ADMIN=true e ADMIN_SENHA conhecida.
"""

import json
import sys
import urllib.request
import urllib.error

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"
ADMIN_EMAIL = "admin@hweld.local"
ADMIN_SENHA = "admin123"

falhas = []


def req(metodo, path, body=None, token=None, esperado=None):
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
    print(f"[{status}] {metodo} {path} {marca}")
    if marca == "FALHOU":
        print("      ->", json.dumps(corpo, ensure_ascii=False)[:300])
    return status, corpo


# ── Auth staff ──────────────────────────────────────────────────────────────
_, login = req("POST", "/api/v1/auth/staff/login",
               {"email": ADMIN_EMAIL, "senha": ADMIN_SENHA}, esperado=200)
token = login["access_token"]
refresh = login["refresh_token"]

req("GET", "/api/v1/usuarios", esperado=401)                       # sem token → 401
req("GET", "/api/v1/usuarios", token=token, esperado=200)

# Perfil insuficiente: cria vendedor (201) ou reusa em re-runs (409) → 403
st, vend = req("POST", "/api/v1/usuarios", token=token, body={
    "nome": "Vendedor Teste", "email": "vendedor@hweld.local",
    "senha": "vend12345", "perfil": "vendedor"})
if st not in (201, 409):
    falhas.append(("POST", "/api/v1/usuarios", st, "201|409", vend))
_, lv = req("POST", "/api/v1/auth/staff/login",
            {"email": "vendedor@hweld.local", "senha": "vend12345"}, esperado=200)
req("GET", "/api/v1/usuarios", token=lv["access_token"], esperado=403)

# ── CRM ─────────────────────────────────────────────────────────────────────
st, emp = req("POST", "/api/v1/empresas", token=token, body={
    "razao_social": "Metalúrgica Fumaça LTDA", "cnpj": "11.222.333/0001-81",
    "status": "ativo"})
if st == 409:
    _, lista = req("GET", "/api/v1/empresas?busca=Metal", token=token, esperado=200)
    emp = next(e for e in lista["itens"] if e["cnpj"] == "11.222.333/0001-81")
elif st != 201:
    falhas.append(("POST", "/api/v1/empresas", st, "201|409", emp))
emp_id = emp["id"]
req("GET", f"/api/v1/empresas?busca=Metal", token=token, esperado=200)

_, end = req("POST", "/api/v1/enderecos", token=token, esperado=201, body={
    "empresa_id": emp_id, "tipo": "fiscal", "cidade": "São Paulo",
    "uf": "SP", "cep": "01310-100", "logradouro": "Av. Paulista",
    "numero": "1000", "principal": True})
end_id = end["id"]

_, ct = req("POST", "/api/v1/contatos", token=token, esperado=201, body={
    "empresa_id": emp_id, "nome": "Comprador Portal", "email": "comprador@metal.com",
    "is_principal": True, "acesso_portal": True})
ct_id = ct["id"]
req("POST", f"/api/v1/contatos/{ct_id}/portal", token=token,
    body={"senha": "portal123"}, esperado=204)

# ── Catálogo ────────────────────────────────────────────────────────────────
_, cat = req("POST", "/api/v1/categorias", token=token, esperado=201, body={
    "nome": "Soldas", "ordem": 1, "ativa": True})
cat_id = cat["id"]
_, prod = req("POST", "/api/v1/produtos", token=token, esperado=201, body={
    "sku": "SOLDA-001", "nome": "Eletrodo E7018 2,5mm", "categoria_id": cat_id,
    "preco_venda": "25.90", "controla_estoque": True, "ativo": True,
    "destaque": False})
prod_id = prod["id"]

# Estoque: entrada manual
req("POST", "/api/v1/estoque/movimentacoes", token=token, esperado=201, body={
    "produto_id": prod_id, "tipo": "entrada", "quantidade": "100",
    "motivo": "carga inicial"})
req("GET", f"/api/v1/estoque/saldo/{prod_id}", token=token, esperado=200)

# ── Portal B2B ──────────────────────────────────────────────────────────────
_, lp = req("POST", "/api/v1/auth/portal/login",
            {"email": "comprador@metal.com", "senha": "portal123"}, esperado=200)
ptoken = lp["access_token"]
req("GET", "/api/v1/portal/catalogo", token=ptoken, esperado=200)
req("GET", "/api/v1/usuarios", token=ptoken, esperado=401)  # token portal ≠ staff

# ── Busca (Elasticsearch) ───────────────────────────────────────────────────
# O produto foi indexado best-effort no POST /produtos; reindex garante
# cobertura total (idempotente — 200 mesmo sem docs novos).
_, reix = req("POST", "/api/v1/busca/reindexar", token=token, esperado=200)
print("      reindexados:", reix["indexados"])

_, bs = req("GET", "/api/v1/busca/produtos?q=eletrodo", token=token, esperado=200)
assert bs["total"] >= 1, "busca staff sem resultados"

# fuzzy: 'eletrodu' (1 erro de digitação) ainda casa 'Eletrodo'
_, bf = req("GET", "/api/v1/portal/busca/produtos?q=eletrodu",
            token=ptoken, esperado=200)
assert any("Eletrodo" in i["nome"] for i in bf["itens"]), \
    f"fuzzy não casou: {bf['itens'][:1]}"

# filtro por faceta (categoria) + facetas com contagem em tempo real
_, bf2 = req("GET",
             f"/api/v1/portal/busca/produtos?q=eletrodo&categoria_id={cat_id}",
             token=ptoken, esperado=200)
assert bf2["total"] >= 1 and "facetas" in bf2
print("      facetas:", json.dumps(bf2["facetas"], ensure_ascii=False)[:200])

# termo sem correspondência → página vazia, não erro
_, bz = req("GET", "/api/v1/portal/busca/produtos?q=zzzinexistente",
            token=ptoken, esperado=200)
assert bz["total"] == 0

# autocomplete — prefixo parcial sugere o produto
_, sug = req("GET", "/api/v1/portal/busca/sugestoes?q=elet",
             token=ptoken, esperado=200)
assert any(s["nome"].startswith("Elet") for s in sug), f"sugestões: {sug}"

req("POST", "/api/v1/portal/carrinho/itens", token=ptoken, esperado=200, body={
    "produto_id": prod_id, "quantidade": "10"})
_, ped = req("POST", "/api/v1/portal/checkout", token=ptoken, esperado=201, body={
    "endereco_faturamento_id": end_id, "endereco_entrega_id": end_id})
ped_id = ped["id"]
print("      pedido:", ped["numero"], ped["status"], "total", ped["total"])

# ── Pedido: transições com reserva de estoque ───────────────────────────────
req("PATCH", f"/api/v1/pedidos/{ped_id}/status", token=token,
    body={"status": "confirmado"}, esperado=200)
_, saldo = req("GET", f"/api/v1/estoque/saldo/{prod_id}", token=token, esperado=200)
print("      saldo após confirmação:", saldo["quantidade_disponivel"],
      "reservado", saldo["quantidade_reservada"])

# ── Financeiro ──────────────────────────────────────────────────────────────
_, cx = req("POST", "/api/v1/caixas/abrir", token=token, esperado=201,
            body={"valor_abertura": "200.00"})
req("POST", "/api/v1/pagamentos/parcelas", token=token, esperado=201, body={
    "pedido_id": ped_id, "quantidade": 2,
    "primeiro_vencimento": "2026-10-19", "intervalo_dias": 30})
_, pars = req("GET", f"/api/v1/pagamentos?pedido_id={ped_id}", token=token, esperado=200)
par_id = pars["itens"][0]["id"]
# forma_pagamento_id é obrigatório — body inválido → 400
req("POST", f"/api/v1/pagamentos/{par_id}/baixar", token=token,
    body={"forma_pagamento_id": None, "observacao": None}, esperado=400)
# forma inexistente → 404
req("POST", f"/api/v1/pagamentos/{par_id}/baixar", token=token,
    body={"forma_pagamento_id": 9999, "observacao": None}, esperado=404)
# forma real (id=1 semeada via SQL) → baixa atômica com lançamento no caixa
req("POST", f"/api/v1/pagamentos/{par_id}/baixar", token=token,
    body={"forma_pagamento_id": 1, "observacao": "recebido"}, esperado=200)
# re-baixar parcela já paga → 409
req("POST", f"/api/v1/pagamentos/{par_id}/baixar", token=token,
    body={"forma_pagamento_id": 1}, esperado=409)

# ── Auditoria ───────────────────────────────────────────────────────────────
req("GET", "/api/v1/auditoria?entidade=pedidos", token=token, esperado=200)

# ── Resumo ──────────────────────────────────────────────────────────────────
print()
if falhas:
    print(f"{len(falhas)} FALHA(S):")
    for f in falhas:
        print("  ", f[0], f[1], "->", f[2], "(esperado", f[3], ")")
    sys.exit(1)
print("Smoke test concluído sem falhas.")

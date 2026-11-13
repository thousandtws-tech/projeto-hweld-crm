#!/usr/bin/env python3
"""Demo E2E hweld: core-api (Rust) + operations-api (Java).
Semeia empresa/contato/produto/endereços, faz checkout no portal B2B,
cria cobrança PIX no Java, confirma via webhook HMAC e verifica o fan-out.
"""
import hashlib, hmac, json, os, sys, time, urllib.request, uuid

# Apontável por env: local (default) ou Railway.
RUST = os.environ.get("RUST_URL", "http://localhost:8080/api/v1")
JAVA = os.environ.get("JAVA_URL", "http://localhost:8090/api/v1")
WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET", "dev-stub-webhook-secret").encode()
SERVICE_TOKEN = os.environ.get("INTERNAL_SERVICE_TOKEN", "dev-internal-token")

def call(base, method, path, body=None, token=None, headers=None, raw=False):
    req = urllib.request.Request(base + path, method=method,
        data=json.dumps(body).encode() if body is not None else None)
    req.add_header("Content-Type", "application/json")
    if token: req.add_header("Authorization", f"Bearer {token}")
    for k, v in (headers or {}).items(): req.add_header(k, v)
    try:
        with urllib.request.urlopen(req) as r:
            data = r.read().decode()
            return r.status, (data if raw or not data else json.loads(data))
    except urllib.error.HTTPError as e:
        data = e.read().decode()
        try: return e.code, json.loads(data)
        except Exception: return e.code, data

def step(n): print(f"\n{'='*60}\n>> {n}\n{'='*60}")
def show(label, r): print(f"  {label} →", json.dumps(r, ensure_ascii=False)[:400])

# ── 1. Staff login (Rust) ──────────────────────────────────────────────────
step("1. Login staff no core-api")
s, r = call(RUST, "POST", "/auth/staff/login",
            {"email": os.environ.get("ADMIN_EMAIL", "admin@hweld.local"),
             "senha": os.environ.get("ADMIN_SENHA", "admin123")})
assert s == 200, r
staff = r["access_token"]
print("  staff JWT ok")

# ── 2. Seed: empresa + contato portal + endereços + catálogo ───────────────
def page_items(r):
    if isinstance(r, list): return r
    for k in ("itens", "items", "content", "dados"):
        if k in r: return r[k]
    return []

step("2. Seed via API do Rust (idempotente)")
s, lista = call(RUST, "GET", "/empresas?busca=Metal", token=staff)
emp = next((e for e in page_items(lista) if e.get("cnpj") == "11222333000181"), None)
if emp is None:
    s, emp = call(RUST, "POST", "/empresas", {
        "razao_social": "Metal Forte Ltda", "nome_fantasia": "Metal Forte",
        "cnpj": "11.222.333/0001-81", "status": "ativo"}, staff)
    assert s == 201, emp
eid = emp["id"]; show("empresa", emp)

s, lista = call(RUST, "GET", f"/contatos?empresa_id={eid}", token=staff)
ct = next((c for c in page_items(lista) if c.get("email") == "comprador@metalforte.com"), None)
if ct is None:
    s, ct = call(RUST, "POST", "/contatos", {
        "empresa_id": eid, "nome": "Comprador Demo", "email": "comprador@metalforte.com",
        "acesso_portal": False, "is_principal": True}, staff)
    assert s == 201, ct
cid = ct["id"]; show("contato", ct)

if not ct.get("acesso_portal"):
    s, r = call(RUST, "POST", f"/contatos/{cid}/portal", {"senha": "portal123"}, staff)
    assert s in (200, 204), r
    print("  portal ativado")

s, lista = call(RUST, "GET", f"/empresas/{eid}/enderecos", token=staff)
end_ids = {e["tipo"]: e["id"] for e in page_items(lista)}
for tipo in ("fiscal", "entrega"):
    if tipo not in end_ids:
        s, e = call(RUST, "POST", "/enderecos", {
            "empresa_id": eid, "tipo": tipo, "logradouro": "Av. Industrial", "numero": "100",
            "bairro": "Distrito", "cidade": "São Paulo", "uf": "SP", "cep": "01000-000",
            "principal": tipo == "fiscal"}, staff)
        assert s == 201, e
        end_ids[tipo] = e["id"]
print(f"  endereços: {end_ids}")

s, lista = call(RUST, "GET", "/categorias", token=staff)
cat = next((c for c in page_items(lista) if c.get("nome") == "Solda"), None)
if cat is None:
    s, cat = call(RUST, "POST", "/categorias",
                  {"nome": "Solda", "ordem": 1, "ativa": True}, staff)
    assert s == 201, cat
catid = cat["id"]; print(f"  categoria id={catid}")

s, lista = call(RUST, "GET", "/produtos?busca=E6013", token=staff)
prod = next((p for p in page_items(lista) if p.get("sku") == "E6013-25"), None)
if prod is None:
    s, prod = call(RUST, "POST", "/produtos", {
        "sku": "E6013-25", "nome": "Eletrodo E6013 2,5mm (cx 20kg)", "categoria_id": catid,
        "unidade_medida": "CX", "preco_venda": "189.90", "controla_estoque": True,
        "ativo": True, "destaque": False}, staff)
    assert s == 201, prod
pid = prod["id"]; show("produto", prod)

# ── 3. Portal B2B: login → carrinho → checkout (pedido aguardando_pagamento) ─
step("3. Portal B2B: login + checkout")
s, r = call(RUST, "POST", "/auth/portal/login",
            {"email": "comprador@metalforte.com", "senha": "portal123"})
assert s == 200, r
portal = r["access_token"]
print("  portal JWT ok")

s, r = call(RUST, "POST", "/portal/carrinho/itens",
            {"produto_id": pid, "quantidade": "2"}, portal)
assert s in (200, 201), r
show("item carrinho", r)

s, pedido = call(RUST, "POST", "/portal/checkout", {
    "endereco_faturamento_id": end_ids["fiscal"],
    "endereco_entrega_id": end_ids["entrega"],
    "condicao_pagamento": "pix"}, portal)
assert s in (200, 201), pedido
pedido_id = pedido["id"]
print(f"  PEDIDO #{pedido_id} status={pedido['status']} total={pedido['total']}")

# ── 4. Java: criar cobrança PIX ─────────────────────────────────────────────
step("4. POST /payments no Java (JWT do portal repassado ao Rust)")
s, pay = call(JAVA, "POST", "/payments",
              {"pedidoId": pedido_id, "method": "PIX"}, portal)
assert s == 201, pay
pay_id, ext_id = pay["id"], pay["externalId"]
show("payment", pay)

s, dup = call(JAVA, "POST", "/payments",
              {"pedidoId": pedido_id, "method": "PIX"}, portal)
print(f"  idempotência: mesmo id? {dup['id'] == pay_id}")

# ── 5. Webhook: sem assinatura → 401; assinado → confirma ───────────────────
step("5. Webhooks do PSP")
wh = {"eventId": str(uuid.uuid4()), "externalId": ext_id, "status": "CONFIRMED"}
s, r = call(JAVA, "POST", "/webhooks/stub", wh)
print(f"  sem assinatura → {s} (esperado 401)")

body = json.dumps(wh).encode()
sig = "sha256=" + hmac.new(WEBHOOK_SECRET, body, hashlib.sha256).hexdigest()
req = urllib.request.Request(JAVA + "/webhooks/stub", method="POST", data=body,
    headers={"Content-Type": "application/json", "X-Signature": sig})
s, r = (lambda resp: (resp.status, json.loads(resp.read())))(urllib.request.urlopen(req))
show(f"assinado → {s}", r)

# replay — mesmo eventId → duplicado
req = urllib.request.Request(JAVA + "/webhooks/stub", method="POST", data=body,
    headers={"Content-Type": "application/json", "X-Signature": sig})
s, r = (lambda resp: (resp.status, json.loads(resp.read())))(urllib.request.urlopen(req))
show(f"replay → {s}", r)

# ── 6. Verificação cruzada ─────────────────────────────────────────────────
step("6. Verificação")
time.sleep(3)  # outbox relay (2s poll)
s, p = call(RUST, "GET", f"/portal/pedidos/{pedido_id}", token=portal)
print(f"  pedido no Rust → status={p.get('status', p)}")
s, p2 = call(JAVA, "GET", f"/payments/{pay_id}", token=portal)
print(f"  payment no Java → status={p2.get('status', p2)}")
s, dl = call(JAVA, "GET", "/notifications", token=staff)
items = dl if isinstance(dl, list) else dl.get("content", dl)
print(f"  deliveries Java → {json.dumps(items, ensure_ascii=False)[:500]}")
s, inv = call(JAVA, "GET", f"/billing?pedidoId={pedido_id}", token=staff)
print(f"  invoices Java → {json.dumps(inv, ensure_ascii=False)[:400]}")
s, fx = call(JAVA, "GET", f"/fiscal-documents?pedidoId={pedido_id}", token=staff)
print(f"  fiscal docs Java → {json.dumps(fx, ensure_ascii=False)[:400]}")

print("\nOK DEMO CONCLUÍDA")

import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  FileKey2,
  Loader2,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, SectionCard } from "@/components/ui-kit/primitives";
import { FormField, fieldClass } from "@/components/ui-kit/FormDialog";
import { exigePerfil } from "@/lib/guards";
import type { ConfigFiscal } from "@/lib/models";
import { fiscalService } from "@/lib/services";
import { useRealtimeEvent } from "@/lib/use-realtime";

export const Route = createFileRoute("/fiscal/configuracao")({
  beforeLoad: exigePerfil("admin", "financeiro"),
  component: ConfigFiscalPage,
});

const PENDENCIA_LABEL: Record<string, string> = {
  certificado_a1: "Certificado digital A1 (.pfx)",
  certificado_expirado: "Certificado expirado — envie um .pfx dentro da validade",
  csc: "CSC — Código de Segurança do Contribuinte",
  serie_nf: "Série da NF-e",
  regime_tributario: "Regime tributário (CRT)",
};

const STATUS_CONFIG = {
  pendente_credenciais: {
    rotulo: "Integração pendente",
    descricao:
      "Complete as credenciais abaixo para habilitar a transmissão fiscal com validade jurídica.",
    cor: "text-[#D9486E]",
    fundo: "border-[#D9486E]/40 bg-[var(--pill-warn-bg)]",
    Icone: AlertTriangle,
  },
  homologacao_pronta: {
    rotulo: "Pronta em homologação",
    descricao:
      "Credenciais completas. Transmissões operam em ambiente de homologação até a ativação do emissor fiscal.",
    cor: "text-[#B8891D]",
    fundo: "border-[#B8891D]/40 bg-[#B8891D]/8",
    Icone: ShieldCheck,
  },
  producao_pronta: {
    rotulo: "Pronta para produção",
    descricao: "Credenciais completas apontando para a SEFAZ de produção.",
    cor: "text-[#2E7D4F]",
    fundo: "border-[#2E7D4F]/40 bg-[#2E7D4F]/8",
    Icone: CheckCircle2,
  },
} as const;

/** Configuração fiscal SEFAZ — credenciais, CSC e certificado digital A1. */
function ConfigFiscalPage() {
  const [cfg, setCfg] = useState<ConfigFiscal | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [enviandoCert, setEnviandoCert] = useState(false);
  const [removendoCert, setRemovendoCert] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [form, setForm] = useState({
    ambiente: "homologacao" as ConfigFiscal["ambiente"],
    serie_nf: "",
    regime_tributario: "",
    csc_id: "",
    csc_token: "",
  });
  const [certSenha, setCertSenha] = useState("");
  const [certValidade, setCertValidade] = useState("");

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    try {
      const c = await fiscalService.config();
      setCfg(c);
      setForm((f) => ({
        ambiente: c.ambiente,
        serie_nf: c.serie_nf ?? "",
        regime_tributario: c.regime_tributario ?? "",
        csc_id: c.csc_id ?? "",
        csc_token: f.csc_token, // segredo nunca volta da API — preserva o digitado
      }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao carregar configuração fiscal.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useRealtimeEvent(
    (t) => t === "fiscal.configuracao",
    () => void carregar(true),
  );

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    try {
      const cfgNova = await fiscalService.salvarConfig({
        ambiente: form.ambiente,
        serie_nf: form.serie_nf,
        regime_tributario: form.regime_tributario,
        csc_id: form.csc_id,
        ...(form.csc_token.trim() ? { csc_token: form.csc_token.trim() } : {}),
      });
      setCfg(cfgNova);
      setForm((f) => ({ ...f, csc_token: "" }));
      toast.success("Configuração fiscal salva.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar configuração.");
    } finally {
      setSalvando(false);
    }
  };

  const enviarCertificado = async (arquivo: File) => {
    setEnviandoCert(true);
    try {
      const cfgNova = await fiscalService.uploadCertificado(
        arquivo,
        certSenha || undefined,
        certValidade || undefined,
      );
      setCfg(cfgNova);
      setCertSenha("");
      setCertValidade("");
      toast.success("Certificado A1 gravado com sucesso.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar certificado.");
    } finally {
      setEnviandoCert(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removerCertificado = async () => {
    setRemovendoCert(true);
    try {
      const cfgNova = await fiscalService.removerCertificado();
      setCfg(cfgNova);
      toast.success("Certificado removido.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao remover certificado.");
    } finally {
      setRemovendoCert(false);
    }
  };

  const status = cfg ? STATUS_CONFIG[cfg.status_integracao] : STATUS_CONFIG.pendente_credenciais;

  return (
    <AppShell>
      <PageHeader
        title="Configuração fiscal"
        subtitle="Credenciais da integração SEFAZ — ambiente, CSC e certificado digital A1"
      />

      {/* Estado da integração */}
      <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 ${status.fundo}`}>
        <status.Icone className={`mt-0.5 h-4 w-4 shrink-0 ${status.cor}`} />
        <div className="min-w-0 space-y-1">
          <div className={`text-xs font-bold ${status.cor}`}>{status.rotulo}</div>
          <p className="text-xs text-muted-foreground">{status.descricao}</p>
          {cfg && cfg.pendencias.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {cfg.pendencias.map((p) => (
                <span
                  key={p}
                  className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                >
                  {PENDENCIA_LABEL[p] ?? p}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-4 lg:grid-cols-2 ${carregando ? "opacity-60" : ""}`}>
        {/* Parâmetros de transmissão */}
        <SectionCard>
          <h2 className="mb-4 text-sm font-semibold">Parâmetros de transmissão</h2>
          <form onSubmit={salvar} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Ambiente SEFAZ *">
                <select
                  className={fieldClass}
                  value={form.ambiente}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      ambiente: e.target.value as ConfigFiscal["ambiente"],
                    }))
                  }
                >
                  <option value="homologacao">Homologação (testes)</option>
                  <option value="producao">Produção (validade jurídica)</option>
                </select>
              </FormField>
              <FormField label="Série da NF-e">
                <input
                  className={fieldClass}
                  maxLength={3}
                  placeholder="Ex.: 1"
                  value={form.serie_nf}
                  onChange={(e) => setForm((f) => ({ ...f, serie_nf: e.target.value }))}
                />
              </FormField>
              <FormField label="Regime tributário (CRT) *">
                <select
                  className={fieldClass}
                  value={form.regime_tributario}
                  onChange={(e) => setForm((f) => ({ ...f, regime_tributario: e.target.value }))}
                >
                  <option value="">Selecione…</option>
                  <option value="1">1 — Simples Nacional</option>
                  <option value="2">2 — Simples, excesso de sublimite</option>
                  <option value="3">3 — Regime Normal</option>
                </select>
              </FormField>
              <FormField label="CSC — ID">
                <input
                  className={fieldClass}
                  maxLength={20}
                  placeholder="Identificador do CSC"
                  value={form.csc_id}
                  onChange={(e) => setForm((f) => ({ ...f, csc_id: e.target.value }))}
                />
              </FormField>
              <FormField
                label={cfg?.csc_configurado ? "CSC — Token (gravado; vazio mantém)" : "CSC — Token"}
                wide
              >
                <input
                  className={fieldClass}
                  type="password"
                  autoComplete="off"
                  placeholder={
                    cfg?.csc_configurado
                      ? "••••••••  (deixe vazio para manter o atual)"
                      : "Token do Código de Segurança do Contribuinte"
                  }
                  value={form.csc_token}
                  onChange={(e) => setForm((f) => ({ ...f, csc_token: e.target.value }))}
                />
              </FormField>
            </div>
            <button
              type="submit"
              disabled={salvando || carregando}
              className="rounded-full bg-lime px-5 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
            >
              {salvando ? "Salvando…" : "Salvar configuração"}
            </button>
          </form>
        </SectionCard>

        {/* Certificado digital A1 */}
        <SectionCard>
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <FileKey2 className="h-4 w-4 text-muted-foreground" /> Certificado digital A1
          </h2>

          {cfg?.certificado_configurado ? (
            <div className="space-y-4">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-4 border-b border-border/60 pb-2">
                  <dt className="text-muted-foreground">Arquivo</dt>
                  <dd className="font-medium">{cfg.certificado_nome ?? "certificado.pfx"}</dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-border/60 pb-2">
                  <dt className="text-muted-foreground">Validade declarada</dt>
                  <dd className="font-medium tabular-nums">
                    {cfg.certificado_validade
                      ? new Date(`${cfg.certificado_validade}T00:00:00`).toLocaleDateString("pt-BR")
                      : "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-border/60 pb-2">
                  <dt className="text-muted-foreground">Fingerprint SHA-256</dt>
                  <dd
                    className="font-mono text-xs text-muted-foreground"
                    title={cfg.certificado_sha256 ?? ""}
                  >
                    {cfg.certificado_sha256 ? `${cfg.certificado_sha256.slice(0, 20)}…` : "—"}
                  </dd>
                </div>
              </dl>
              <button
                type="button"
                onClick={() => void removerCertificado()}
                disabled={removendoCert}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#D92546]/30 px-4 py-1.5 text-xs font-semibold text-[#D92546] hover:bg-[#D92546]/10 disabled:opacity-50"
              >
                {removendoCert ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Remover certificado
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={enviandoCert}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-secondary/20 px-6 py-8 text-center text-muted-foreground transition hover:border-primary hover:text-foreground disabled:opacity-50"
              >
                {enviandoCert ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Upload className="h-5 w-5" />
                )}
                <span className="text-xs font-semibold text-foreground">
                  Enviar certificado .pfx / .p12
                </span>
                <span className="text-[11px]">
                  O arquivo é gravado no banco — a API nunca devolve os bytes nem a senha
                </span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".pfx,.p12,application/x-pkcs12"
                className="hidden"
                onChange={(e) => {
                  const arq = e.target.files?.[0];
                  if (arq) void enviarCertificado(arq);
                }}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Senha do certificado">
                  <input
                    className={fieldClass}
                    type="password"
                    autoComplete="off"
                    value={certSenha}
                    onChange={(e) => setCertSenha(e.target.value)}
                  />
                </FormField>
                <FormField label="Validade (AAAA-MM-DD)">
                  <input
                    className={fieldClass}
                    type="date"
                    value={certValidade}
                    onChange={(e) => setCertValidade(e.target.value)}
                  />
                </FormField>
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}

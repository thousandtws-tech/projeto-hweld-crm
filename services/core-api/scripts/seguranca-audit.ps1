# Auditoria de segurança das dependências Rust (P0 — LGPD/Art. 49).
# Uso: .\scripts\seguranca-audit.ps1 [-ComGeiger]
# Pré-requisito: cargo install cargo-audit
# Opcional:      cargo install cargo-geiger (contagem de unsafe)

param(
    [switch]$ComGeiger
)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "==> cargo audit (vulnerabilidades conhecidas — RustSec)" -ForegroundColor Cyan
cargo audit
if ($LASTEXITCODE -ne 0) {
    Write-Host "FALHOU: vulnerabilidades encontradas — veja .cargo/audit.toml para ignores justificados" -ForegroundColor Red
    exit $LASTEXITCODE
}

if ($ComGeiger) {
    if (Get-Command cargo-geiger -ErrorAction SilentlyContinue) {
        Write-Host ""
        Write-Host "==> cargo geiger (blocos unsafe no projeto + dependências)" -ForegroundColor Cyan
        cargo geiger --all-features
    } else {
        Write-Host ""
        Write-Host "==> cargo-geiger não instalado — pulando (cargo install cargo-geiger)" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "==> auditoria concluída — sem vulnerabilidades conhecidas" -ForegroundColor Green

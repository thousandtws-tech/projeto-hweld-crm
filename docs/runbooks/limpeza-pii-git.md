# Limpeza de PII no histórico Git — `deliv.json`

## Situação

- `deliv.json` (raiz) foi commitado em `35c654e` — contém **PII real**
  (e-mail de cliente, payload de e-mail transacional).
- Não está mais na árvore de trabalho — mas **permanece no histórico**:
  qualquer clone acessa o dado. Precisa de reescrita de histórico.
- `.gitignore` já protege contra re-commit.

## Procedimento (DESTRUTIVO — reescreve histórico)

> Pré-requisito: avisar colaboradores — após o push, **todos devem
> re-clonar** ou rebasear. PRs abertas contra commits antigos quebram.

```bash
# 1. Ferramenta — git-filter-repo (recomendado sobre filter-branch)
pip install git-filter-repo

# 2. Backup de segurança
git clone --mirror . ../projeto-hweld-crm-BACKUP.git

# 3. Remover o arquivo de TODO o histórico
git filter-repo --path deliv.json --invert-paths

# 4. Re-conectar o remote (filter-repo o remove por segurança)
git remote add origin <url-do-repo>

# 5. Force-push coordenado
git push --force-with-lease origin --all
git push --force-with-lease origin --tags
```

## Pós-limpeza

1. **GitHub**: abrir ticket em support.github.com pedindo expurgo de cache
   (forks/PRs retêm os blobs mesmo após force-push). Alternativa self-service:
   apagar e recriar o repo — só se não houver PRs/forks relevantes.
2. **Secrets**: revisar o conteúdo do arquivo — além de PII, conferir se
   havia credenciais/tokens a rotacionar.
3. **CI**: após o push, confirmar que os workflows passam no novo HEAD.

## Prevenção (já aplicada)

- `deliv.json` no `.gitignore` raiz.
- Regra de bolso: dumps/fixtures com dados reais nunca entram no repo —
  usar dados sintéticos em `tests/fixtures/` ou storage interno.

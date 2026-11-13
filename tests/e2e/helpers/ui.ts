import type { Page } from "@playwright/test";

import { staffSessao } from "./api";

/**
 * Injeta uma sessão staff real no browser — mesmas chaves que o painel
 * admin usa (`sessionStorage`), sem passar pela tela de login.
 * Deve ser chamado ANTES do primeiro page.goto().
 */
export async function injetarSessaoStaff(page: Page): Promise<void> {
  const sessao = await staffSessao();
  await page.addInitScript(
    ([access, refresh]) => {
      sessionStorage.setItem("hw_staff_access", access);
      sessionStorage.setItem("hw_staff_refresh", refresh);
    },
    [sessao.access_token, sessao.refresh_token!],
  );
}

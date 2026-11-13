import { API_URL } from "./config";
import { accessToken, accessTokenValido, refreshToken, refreshTokens } from "./session";

export type ModoAutoAjuste = "cover" | "contain" | "smart-banner" | "proporcional";

export interface OpcoesAutoAjuste {
  largura: number;
  altura: number;
  modo: ModoAutoAjuste;
  qualidade?: number;
  fundo?: string;
}

/**
 * Presets oficiais de resolução e proporção (Aspect Ratio) usados em grandes
 * plataformas de e-commerce (Shopify / VTEX / Mercado Livre):
 * garante que qualquer imagem enviada pelo usuário seja auto-ajustada em largura
 * e altura antes de ir para o servidor.
 */
export const PRESETS_MIDIA: Record<
  "banner-desktop" | "banner-mobile" | "banner-trio" | "banner-duo" | "categoria" | "marca" | "produto" | "selo",
  OpcoesAutoAjuste
> = {
  "banner-desktop": { largura: 1920, altura: 780, modo: "smart-banner", qualidade: 0.92 },
  "banner-mobile": { largura: 1080, altura: 1350, modo: "cover", qualidade: 0.88 },
  "banner-trio": { largura: 900, altura: 560, modo: "cover", qualidade: 0.88 },
  "banner-duo": { largura: 1200, altura: 620, modo: "cover", qualidade: 0.88 },
  categoria: { largura: 800, altura: 480, modo: "cover", qualidade: 0.88 },
  marca: { largura: 480, altura: 200, modo: "contain", qualidade: 0.9 },
  selo: { largura: 128, altura: 128, modo: "contain", qualidade: 0.9 },
  produto: { largura: 1000, altura: 1000, modo: "contain", qualidade: 0.88, fundo: "#ffffff" },
};

export async function processarEEnviarComPreset(
  file: File,
  presetKey: keyof typeof PRESETS_MIDIA,
  modoOverride?: ModoAutoAjuste,
): Promise<string> {
  const preset = PRESETS_MIDIA[presetKey];
  const blob = await redimensionarComAutoAjuste(file, {
    ...preset,
    modo: modoOverride ?? preset.modo,
  });
  return enviarBlobMidia(blob);
}

/**
 * Compatibilidade direta: quando chamado com `maxDimensao`, redimensiona proporcionalmente.
 */
export async function processarEEnviarImagem(
  file: File,
  maxDimensao = 1400,
  qualidade = 0.86,
): Promise<string> {
  const blob = await redimensionarComAutoAjuste(file, {
    largura: maxDimensao,
    altura: maxDimensao,
    modo: "proporcional",
    qualidade,
  });
  return enviarBlobMidia(blob);
}

async function enviarBlobMidia(blob: Blob): Promise<string> {
  if (!accessTokenValido() && refreshToken()) {
    await refreshTokens();
  }
  const token = accessToken();
  let res: Response;
  try {
    res = await fetch(`${API_URL}/midia/upload`, {
      method: "POST",
      headers: {
        "Content-Type": blob.type || "image/webp",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: blob,
    });
  } catch {
    throw new Error("Falha de rede ao enviar a imagem — verifique se o servidor está no ar.");
  }

  if (!res.ok) {
    let mensagem = `Falha no upload da imagem (HTTP ${res.status}).`;
    try {
      const body = (await res.json()) as { erro?: { mensagem?: string } };
      if (body?.erro?.mensagem) mensagem = body.erro.mensagem;
    } catch {
      /* mantém a mensagem padrão com o status HTTP */
    }
    throw new Error(mensagem);
  }

  const json = (await res.json()) as { url?: string };
  if (!json.url) throw new Error("Servidor não retornou a URL da imagem enviada.");
  return json.url;
}

/**
 * Motor de Auto-Ajuste de Largura e Altura em Canvas:
 * - `cover`: Center-Weighted Smart Crop — preenche 100% da largura×altura alvo sem faixas vazias e sem distorcer.
 * - `contain`: Encaixa 100% da imagem dentro da largura×altura alvo sem cortar nenhuma borda (ideal para logos e produtos).
 * - `smart-banner`: Se a arte enviada já é horizontal (ratio entre 2.2 e 4.0), ajusta suavemente para 2000×650 sem cortar textos nas bordas; caso contrário, usa Ambient Blur + Contain ou Cover inteligente.
 * - `proporcional`: Limita apenas o maior lado mantendo o aspect ratio original.
 */
function redimensionarComAutoAjuste(file: File, opcoes: OpcoesAutoAjuste): Promise<Blob> {
  const { largura: targetW, altura: targetH, modo, qualidade = 0.88, fundo } = opcoes;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo de imagem."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Formato de imagem inválido."));
      img.onload = () => {
        const srcW = img.width;
        const srcH = img.height;

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas indisponível."));
          return;
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        if (modo === "proporcional") {
          let w = srcW;
          let h = srcH;
          const maxDim = Math.max(targetW, targetH);
          if (w > maxDim || h > maxDim) {
            if (w >= h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(img, 0, 0, w, h);
        } else if (modo === "cover") {
          canvas.width = targetW;
          canvas.height = targetH;
          if (fundo) {
            ctx.fillStyle = fundo;
            ctx.fillRect(0, 0, targetW, targetH);
          }
          const scale = Math.max(targetW / srcW, targetH / srcH);
          const drawW = srcW * scale;
          const drawH = srcH * scale;
          const dx = (targetW - drawW) / 2;
          const dy = (targetH - drawH) / 2;
          ctx.drawImage(img, dx, dy, drawW, drawH);
        } else if (modo === "smart-banner") {
          canvas.width = targetW;
          canvas.height = targetH;
          const srcRatio = srcW / srcH;
          const targetRatio = targetW / targetH;
          // Se a arte já é um banner horizontal (ex: 16:9 a 4:1), encaixa 100% da largura×altura sem cortar textos laterais
          if (srcRatio >= 1.8 && srcRatio <= 4.5) {
            ctx.drawImage(img, 0, 0, targetW, targetH);
          } else {
            // Para imagens quadradas/verticais em banner: fundo ambient-blur + imagem inteira centralizada
            const bgScale = Math.max(targetW / srcW, targetH / srcH) * 1.1;
            const bgW = srcW * bgScale;
            const bgH = srcH * bgScale;
            ctx.filter = "blur(24px) brightness(0.55)";
            ctx.drawImage(img, (targetW - bgW) / 2, (targetH - bgH) / 2, bgW, bgH);
            ctx.filter = "none";

            const fgScale = Math.min(targetW / srcW, targetH / srcH);
            const fgW = srcW * fgScale;
            const fgH = srcH * fgScale;
            ctx.drawImage(img, (targetW - fgW) / 2, (targetH - fgH) / 2, fgW, fgH);
          }
        } else {
          // modo === "contain"
          canvas.width = targetW;
          canvas.height = targetH;
          if (fundo) {
            ctx.fillStyle = fundo;
            ctx.fillRect(0, 0, targetW, targetH);
          }
          const scale = Math.min(targetW / srcW, targetH / srcH);
          const drawW = srcW * scale;
          const drawH = srcH * scale;
          const dx = (targetW - drawW) / 2;
          const dy = (targetH - drawH) / 2;
          ctx.drawImage(img, dx, dy, drawW, drawH);
        }

        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error("Falha ao codificar WebP."));
          },
          "image/webp",
          qualidade,
        );
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

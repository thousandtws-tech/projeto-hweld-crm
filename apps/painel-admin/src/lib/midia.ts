import { API_URL } from "./config";
import { accessToken, accessTokenValido, refreshToken, refreshTokens } from "./session";

/**
 * Algoritmo de Otimização de Mídia de E-commerce (Client-Side Image Pipeline):
 * 1. Decodifica qualquer imagem selecionada/arrastada pelo usuário;
 * 2. Redimensiona proporcionalmente (máx. 1400px no maior eixo, preservando nitidez de zoom);
 * 3. Converte para WebP de alta eficiência (qualidade 0.86);
 * 4. Envia os bytes binários para `POST /api/v1/midia/upload` no servidor Rust.
 *
 * Falha de upload PROPAGA como erro — nunca retorna Data URL em silêncio:
 * uma "foto" que não foi persistida enganaria o usuário (bug histórico).
 */
export async function processarEEnviarImagem(
  file: File,
  maxDimensao = 1400,
  qualidade = 0.86,
): Promise<string> {
  const blob = await comprimirParaWebp(file, maxDimensao, qualidade);

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

function comprimirParaWebp(file: File, maxDimensao: number, qualidade: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo de imagem."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Formato de imagem inválido."));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimensao || height > maxDimensao) {
          if (width >= height) {
            height = Math.round((height * maxDimensao) / width);
            width = maxDimensao;
          } else {
            width = Math.round((width * maxDimensao) / height);
            height = maxDimensao;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas indisponível."));
          return;
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("Falha ao codificar WebP."));
            }
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

/**
 * Resolve uma URL de mídia para uma URL pública que a Z-API consegue baixar.
 *
 * Por que isto existe?
 * - Mídias persistidas em `media.storageUrl` ficam em `/manus-storage/<key>`,
 *   um caminho que SÓ funciona dentro do nosso servidor (faz redirect 307
 *   para o S3 com Authorization). A Z-API tenta baixar a URL do lado dela
 *   e recebe 401/redirect e responde com o erro:
 *   `Message was not sent to queue [Base64/Url could not be read]`.
 * - A solução é entregar uma URL S3/CloudFront já assinada (presigned GET),
 *   acessível por qualquer cliente HTTP sem credenciais.
 *
 * Estratégia (em ordem):
 * 1. Se já é http(s) absoluto → retorna como está.
 * 2. Se é `/manus-storage/<key>` ou já é a `storageKey`, gera signed URL
 *    via `storageGetSignedUrl(key)` (CloudFront com Expires + Signature).
 * 3. Fallback: se PUBLIC_BASE_URL estiver definido, devolve a URL absoluta
 *    apontando para o nosso domínio (a Z-API ainda terá que aceitar o redirect).
 */
import { storageGetSignedUrl } from "../storage";

const STORAGE_PREFIX = "/manus-storage/";

export async function resolvePublicMediaUrl(
  storageUrl: string | null | undefined,
  storageKey: string | null | undefined,
): Promise<string> {
  const url = (storageUrl ?? "").trim();
  if (!url) {
    if (storageKey) return await storageGetSignedUrl(storageKey);
    throw new Error("Mídia sem URL e sem chave de storage");
  }
  if (/^https?:\/\//i.test(url)) return url;

  // Caminho /manus-storage/<key> → extrai a key e gera signed URL
  if (url.startsWith(STORAGE_PREFIX)) {
    const key = url.slice(STORAGE_PREFIX.length).replace(/^\/+/, "");
    if (key) return await storageGetSignedUrl(key);
  }

  // Tem uma key explícita? usa-a
  if (storageKey) {
    return await storageGetSignedUrl(storageKey);
  }

  // Último recurso: prefixar com PUBLIC_BASE_URL
  const base =
    process.env.PUBLIC_BASE_URL ||
    process.env.APP_URL ||
    "";
  if (base) return `${base.replace(/\/+$/, "")}${url.startsWith("/") ? url : "/" + url}`;
  throw new Error(
    "Não foi possível resolver URL pública da mídia (sem storageKey nem PUBLIC_BASE_URL)",
  );
}

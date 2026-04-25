/**
 * Detecta quais mídias devem ser enviadas a partir das regras configuradas.
 * Tipos:
 *  - keyword: mensagem do lead contém alguma palavra-chave
 *  - step: a etapa atual da conversa coincide com a do gatilho
 *  - ai_decision: resolvido pela própria IA (apenas exposto no prompt)
 */
import type { MediaTrigger, MediaAsset } from "../../drizzle/schema";

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

export function detectKeywordTriggers(
  triggers: MediaTrigger[],
  inboundText: string,
  alreadySentMediaIds: number[] = []
): number[] {
  const text = norm(inboundText);
  const ids: number[] = [];
  for (const t of triggers) {
    if (!t.isActive) continue;
    if (t.triggerType !== "keyword") continue;
    if (t.sendOncePerConversation && alreadySentMediaIds.includes(t.mediaId)) continue;
    const kws = (t.keywords ?? "")
      .split(",")
      .map(k => norm(k))
      .filter(k => k.length > 0);
    if (kws.some(k => text.includes(k))) ids.push(t.mediaId);
  }
  return Array.from(new Set(ids));
}

export function detectStepTriggers(
  triggers: MediaTrigger[],
  currentStepId: number | null | undefined,
  alreadySentMediaIds: number[] = []
): number[] {
  if (!currentStepId) return [];
  const ids: number[] = [];
  for (const t of triggers) {
    if (!t.isActive) continue;
    if (t.triggerType !== "step") continue;
    if (t.stepId !== currentStepId) continue;
    if (t.sendOncePerConversation && alreadySentMediaIds.includes(t.mediaId)) continue;
    ids.push(t.mediaId);
  }
  return Array.from(new Set(ids));
}

export function getAvailableMediaForPrompt(
  triggers: MediaTrigger[],
  allMedia: MediaAsset[]
): Array<MediaAsset & { triggerHint?: string }> {
  return allMedia.map(m => {
    const hints = triggers
      .filter(t => t.mediaId === m.id && t.isActive)
      .map(t => {
        if (t.triggerType === "keyword") return `palavras-chave: ${t.keywords ?? ""}`;
        if (t.triggerType === "step") return `etapa: #${t.stepId}`;
        return "decisão da IA";
      });
    return { ...m, triggerHint: hints.join(" | ") || undefined };
  });
}

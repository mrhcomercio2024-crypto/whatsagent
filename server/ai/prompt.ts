/**
 * Constrói o prompt do agente de IA combinando:
 *  1. Cérebro (persona, regras, tom, produtos, objeções, info da empresa)
 *  2. Etapa atual obrigatória do script (instruções + critérios de avanço)
 *  3. Lista de etapas (para o agente entender onde está no funil)
 *  4. Conhecimento relevante (RAG simples por palavra-chave)
 *  5. Mídias disponíveis e seus gatilhos (a IA pode pedir pra enviar mídia)
 *  6. Memória da conversa (últimas N mensagens)
 *
 * O agente é instruído a NUNCA inventar nada fora desse contexto.
 */

import type { Message } from "../_core/llm";
import type {
  Agent,
  AgentBrain,
  KnowledgeBaseItem,
  MediaAsset,
  ScriptStep,
  Message as DbMessage,
} from "../../drizzle/schema";

export type PromptContext = {
  agent: Agent;
  brain: AgentBrain | undefined;
  steps: ScriptStep[];
  currentStep: ScriptStep | undefined;
  knowledge: KnowledgeBaseItem[];
  availableMedia: Array<MediaAsset & { triggerHint?: string }>;
  history: DbMessage[];
  leadName?: string | null;
  leadPhone?: string | null;
  restrictedTerms?: Array<{ term: string; action: "block" | "rewrite" }>;
};

const HARD_RULES = `
REGRAS INVIOLÁVEIS:
- Você é o agente acima. Responda SOMENTE com base nas informações do "Cérebro do Agente" e "Base de Conhecimento". Se não souber algo, diga educadamente que vai verificar e proponha próxima etapa.
- NUNCA invente preços, prazos, descontos, condições ou produtos que não estejam no cérebro/base.
- Siga rigorosamente a ETAPA ATUAL DO SCRIPT. Não pule etapas obrigatórias.
- Soe humano: respostas curtas, naturais, com no máximo 2-3 frases por mensagem. Use o tom configurado.
- Pergunte uma coisa de cada vez. Não despeje informação.
- Quando precisar enviar uma imagem ou vídeo da biblioteca, use a marcação especial: [SEND_MEDIA:<id>] em qualquer parte da resposta. Use SOMENTE ids da lista "Mídias disponíveis".
- Se a etapa atual exigir avanço (critério cumprido), inclua [STEP_ADVANCE] no final.
- Se o lead pedir para falar com humano ou demonstrar irritação séria, inclua [HANDOFF].
- Sua resposta visível ao lead NÃO deve mostrar essas marcações como "[SEND_MEDIA...]" — elas serão removidas do texto enviado, mas precisam estar no seu output para que o sistema execute a ação.
`;

function fmtIfPresent(label: string, val?: string | null): string {
  if (!val || !val.trim()) return "";
  return `\n## ${label}\n${val.trim()}\n`;
}

export function buildSystemPrompt(ctx: PromptContext): string {
  const { agent, brain, steps, currentStep, knowledge, availableMedia, leadName, leadPhone } = ctx;

  const stepsList = steps
    .map(
      (s, i) =>
        `${i + 1}. ${s.name}${s.id === currentStep?.id ? " ← ETAPA ATUAL" : ""}${
          s.isMandatory ? " (obrigatória)" : ""
        }`
    )
    .join("\n");

  const currentStepBlock = currentStep
    ? `
## ETAPA ATUAL: ${currentStep.name}
Instruções específicas desta etapa (siga rigorosamente):
${currentStep.instructions}

Critério para avançar à próxima etapa:
${currentStep.completionCriteria || "(não definido — use bom senso para avançar quando o objetivo da etapa estiver cumprido)"}
`
    : "## ETAPA ATUAL: nenhuma etapa configurada — siga o cérebro livremente.";

  const knowledgeBlock =
    knowledge.length > 0
      ? `
## BASE DE CONHECIMENTO RELEVANTE
${knowledge
  .slice(0, 8)
  .map(k => `### ${k.title}\n${k.content}`)
  .join("\n\n")}
`
      : "";

  const mediaBlock =
    availableMedia.length > 0
      ? `
## MÍDIAS DISPONÍVEIS (use [SEND_MEDIA:<id>] quando fizer sentido)
${availableMedia
  .map(
    m =>
      `- id=${m.id} | ${m.mediaType.toUpperCase()} | "${m.name}" — ${m.description ?? ""}${
        m.triggerHint ? ` [hint: ${m.triggerHint}]` : ""
      }`
  )
  .join("\n")}
`
      : "";

  const restrictedBlock =
    (ctx.restrictedTerms ?? []).length > 0
      ? `\n## TERMOS PROIBIDOS (NUNCA usar; reescreva ou omita)\n${ctx.restrictedTerms!
          .map(t => `- "${t.term}"${t.action === "rewrite" ? " (pode reescrever)" : " (não pode aparecer de forma alguma)"}`)
          .join("\n")}\n`
      : "";

  return `Você é "${agent.name}", agente de vendas via WhatsApp.

# CÉREBRO DO AGENTE
${fmtIfPresent("Persona", agent.persona)}${fmtIfPresent("Prompt mestre", brain?.masterPrompt)}${fmtIfPresent("Tom de voz", brain?.tone)}${fmtIfPresent("Regras estritas", brain?.rules)}${fmtIfPresent("Produtos / Serviços", brain?.products)}${fmtIfPresent("Objeções comuns e respostas", brain?.objections)}${fmtIfPresent("Informações da empresa", brain?.companyInfo)}

# FUNIL DE ATENDIMENTO
${stepsList || "(sem etapas configuradas)"}

${currentStepBlock}
${knowledgeBlock}
${mediaBlock}
${restrictedBlock}
# DADOS DO LEAD
- Nome: ${leadName || "(desconhecido — pergunte se necessário pela etapa)"}
- Telefone: ${leadPhone || "(oculto)"}

${HARD_RULES}
`;
}

/**
 * Monta o array completo de Messages para o LLM, incluindo o system prompt
 * e o histórico recente (até maxHistory mensagens).
 */
export function buildMessages(ctx: PromptContext, maxHistory = 30): Message[] {
  const system = buildSystemPrompt(ctx);
  const history: Message[] = ctx.history
    .slice(-maxHistory)
    .filter(m => m.body && m.body.trim().length > 0)
    .map(m => ({
      role:
        m.direction === "inbound"
          ? "user"
          : m.sender === "human"
          ? "assistant"
          : "assistant",
      content: m.body || "",
    }));
  return [{ role: "system", content: system }, ...history];
}

/**
 * RAG simples: filtra itens de KB cujas tags ou título batem com palavras
 * recentes do lead. Sem embeddings, mas barato e self-hosted.
 */
export function selectKnowledge(
  knowledge: KnowledgeBaseItem[],
  recentText: string,
  maxItems = 6
): KnowledgeBaseItem[] {
  if (knowledge.length === 0) return [];
  const tokens = recentText
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 4);
  if (tokens.length === 0) return knowledge.slice(0, maxItems);

  const scored = knowledge.map(k => {
    const hay = `${k.title} ${k.tags ?? ""} ${k.content}`
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    let score = 0;
    for (const t of tokens) if (hay.includes(t)) score += 1;
    return { k, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const useful = scored.filter(s => s.score > 0).slice(0, maxItems);
  if (useful.length === 0) return knowledge.slice(0, Math.min(3, knowledge.length));
  return useful.map(s => s.k);
}

/**
 * Detecta marcações no output da IA: [SEND_MEDIA:<id>], [STEP_ADVANCE], [HANDOFF]
 */
export function parseAgentOutput(raw: string): {
  cleanText: string;
  mediaIds: number[];
  stepAdvance: boolean;
  handoff: boolean;
} {
  const mediaIds: number[] = [];
  const mediaRegex = /\[SEND_MEDIA:(\d+)\]/g;
  let m;
  while ((m = mediaRegex.exec(raw)) !== null) mediaIds.push(parseInt(m[1], 10));
  const stepAdvance = /\[STEP_ADVANCE\]/i.test(raw);
  const handoff = /\[HANDOFF\]/i.test(raw);

  const cleanText = raw
    .replace(mediaRegex, "")
    .replace(/\[STEP_ADVANCE\]/gi, "")
    .replace(/\[HANDOFF\]/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { cleanText, mediaIds, stepAdvance, handoff };
}


/**
 * Verifica se o texto contém algum termo proibido (case-insensitive, sem acentos).
 * Retorna a lista de termos encontrados (vazio = ok).
 */
export function findRestrictedHits(
  text: string,
  terms: Array<{ term: string; action: "block" | "rewrite" }>
): Array<{ term: string; action: "block" | "rewrite" }> {
  if (!text || terms.length === 0) return [];
  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const haystack = norm(text);
  return terms.filter(t => {
    const needle = norm(t.term).trim();
    return needle.length > 0 && haystack.includes(needle);
  });
}

/**
 * Substitui ocorrências (case-insensitive) dos termos `rewrite`/`block` no
 * texto por travessão "—". Usado como fallback quando a IA não obedece à
 * regra após uma re-tentativa.
 */
export function maskRestrictedTerms(
  text: string,
  terms: Array<{ term: string }>
): string {
  if (!text || terms.length === 0) return text;
  let out = text;
  for (const t of terms) {
    const term = t.term.trim();
    if (!term) continue;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(escaped, "gi"), "—");
  }
  return out;
}

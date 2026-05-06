/**
 * server/ai/leadFactsExtractor.ts
 *
 * Extrai fatos estruturados sobre o lead a partir do histórico da conversa,
 * preenchendo leads.facts (JSON). O orchestrator injeta no prompt do
 * próximo turno como "FATOS CONHECIDOS DO LEAD" para evitar perguntas
 * repetidas.
 *
 * Roda em fire-and-forget (não bloqueia resposta), usa modelo barato.
 */

import { getDb } from "../db";
import { leads } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { invokeWithModel } from "./invoke";

// ════════════════════════════════════════════════════════════
// Schema padrão (caso vendas)
// ════════════════════════════════════════════════════════════

export type LeadFacts = {
  // Identificação
  nome?: string;
  cidade?: string;
  estado?: string;

  // Contexto profissional
  ocupacao_atual?:
    | "clt"
    | "freelancer"
    | "desempregado"
    | "ja_empreende"
    | "estudante"
    | "outro";
  renda_mensal_brl?: number;

  // Experiência online
  ja_vende_online?: boolean;
  marketplace_principal?:
    | "shopee"
    | "mercado_livre"
    | "amazon"
    | "tiktok_shop"
    | "instagram"
    | "site_proprio"
    | "nenhum";
  ticket_medio_atual_brl?: number;
  meses_experiencia?: number;

  // Objetivos
  meta_renda_mensal_brl?: number;
  prazo_objetivo_meses?: number;

  // Fricção
  objecao_principal?:
    | "preco"
    | "tempo"
    | "tecnologia"
    | "ceticismo"
    | "concorrencia"
    | "outro";
  dores_mencionadas?: string[];

  // Fit
  tem_capital_inicial?: boolean;
  capital_inicial_brl?: number;
  disponibilidade_horas_semana?: number;

  // Estado da conversa
  produto_de_interesse?: string;
  pronto_para_comprar?: boolean;

  // Permite extensões livres
  [key: string]: unknown;
};

export const FACTS_SCHEMA_DESCRIPTION = `
Schema de fatos do lead (preencha SOMENTE os que vierem explicitamente do diálogo, deixe ausente os que não foram mencionados):

- nome: string (primeiro nome do lead)
- cidade: string
- estado: string (sigla, ex: "SP", "RJ")
- ocupacao_atual: "clt" | "freelancer" | "desempregado" | "ja_empreende" | "estudante" | "outro"
- renda_mensal_brl: number (renda mensal atual em reais)
- ja_vende_online: boolean
- marketplace_principal: "shopee" | "mercado_livre" | "amazon" | "tiktok_shop" | "instagram" | "site_proprio" | "nenhum"
- ticket_medio_atual_brl: number (faturamento mensal atual com vendas online)
- meses_experiencia: number
- meta_renda_mensal_brl: number (meta declarada)
- prazo_objetivo_meses: number
- objecao_principal: "preco" | "tempo" | "tecnologia" | "ceticismo" | "concorrencia" | "outro"
- dores_mencionadas: string[] (lista curta de dores que ele citou)
- tem_capital_inicial: boolean
- capital_inicial_brl: number
- disponibilidade_horas_semana: number
- produto_de_interesse: string
- pronto_para_comprar: boolean (true se ele indicou intenção clara de compra agora)
`.trim();

// ════════════════════════════════════════════════════════════
// Extração
// ════════════════════════════════════════════════════════════

export type ConversationTurn = { role: "user" | "assistant"; content: string };

export async function extractLeadFacts(
  history: ConversationTurn[],
  existingFacts: LeadFacts = {},
  llmModel: string = "gpt-4o-mini",
  ctx?: { agentId?: number; conversationId?: number; leadId?: number }
): Promise<{ facts: LeadFacts; updated: boolean; raw?: string }> {
  if (!history || history.length === 0) {
    return { facts: existingFacts, updated: false };
  }

  const recent = history.slice(-12);
  const transcript = recent
    .map(t => (t.role === "user" ? "LEAD: " : "AGENTE: ") + t.content)
    .join("\n");

  const prompt = [
    `Você é extrator de fatos de conversas de venda. Leia a conversa entre AGENTE e LEAD abaixo e extraia fatos sobre o LEAD em JSON.`,
    ``,
    FACTS_SCHEMA_DESCRIPTION,
    ``,
    `REGRAS:`,
    `1. Inclua APENAS chaves cujas informações foram explicitamente ditas na conversa.`,
    `2. Não invente, não suponha, não infira por contexto cultural.`,
    `3. Se o lead disse "ganho uns 3 mil", renda_mensal_brl = 3000.`,
    `4. Se o lead disse "trabalho com carteira", ocupacao_atual = "clt".`,
    `5. Responda APENAS em JSON válido, sem texto antes ou depois, sem markdown.`,
    ``,
    `CONVERSA:`,
    transcript,
    ``,
    `JSON:`,
  ].join("\n");

  try {
    const result = await invokeWithModel({
      model: llmModel,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      maxTokens: 500,
      tracking: {
        purpose: "lead_facts_extraction",
        agentId: ctx?.agentId,
        conversationId: ctx?.conversationId,
        leadId: ctx?.leadId,
      },
    });

    const cleaned = (result.text || "").replace(/```json|```/g, "").trim();
    const newFacts: LeadFacts = JSON.parse(cleaned);

    const merged: LeadFacts = { ...existingFacts };
    let changed = false;

    for (const [k, v] of Object.entries(newFacts)) {
      if (v === undefined || v === null || v === "") continue;
      const oldVal = (existingFacts as Record<string, unknown>)[k];
      if (JSON.stringify(oldVal) !== JSON.stringify(v)) {
        (merged as Record<string, unknown>)[k] = v;
        changed = true;
      }
    }

    return { facts: merged, updated: changed, raw: cleaned };
  } catch (e) {
    console.warn("[leadFactsExtractor] extract error:", e);
    return { facts: existingFacts, updated: false };
  }
}

// ════════════════════════════════════════════════════════════
// Persistência
// ════════════════════════════════════════════════════════════

export async function saveLeadFacts(leadId: number, facts: LeadFacts): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(leads)
    .set({
      facts: facts as unknown as Record<string, unknown>,
      factsUpdatedAt: new Date(),
    })
    .where(eq(leads.id, leadId));
}

export async function getLeadFacts(leadId: number): Promise<LeadFacts> {
  const db = await getDb();
  if (!db) return {};
  const rows = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!rows[0]) return {};
  return ((rows[0] as { facts?: LeadFacts | null }).facts ?? {}) as LeadFacts;
}

// ════════════════════════════════════════════════════════════
// Renderização pro prompt
// ════════════════════════════════════════════════════════════

export function renderFactsForPrompt(facts: LeadFacts): string {
  const entries = Object.entries(facts).filter(
    ([, v]) => v !== undefined && v !== null && v !== ""
  );
  if (entries.length === 0) return "";

  const lines: string[] = [];
  lines.push(`FATOS CONHECIDOS DO LEAD (não pergunte de novo o que já está aqui):`);
  for (const [k, v] of entries) {
    const display = Array.isArray(v) ? v.join(", ") : String(v);
    lines.push(`- ${k}: ${display}`);
  }
  return lines.join("\n");
}

// ════════════════════════════════════════════════════════════
// Wrapper fire-and-forget pro orchestrator
// ════════════════════════════════════════════════════════════

export function extractAndSaveAsync(
  leadId: number,
  history: ConversationTurn[],
  existingFacts: LeadFacts,
  llmModel?: string,
  ctx?: { agentId?: number; conversationId?: number }
): void {
  extractLeadFacts(history, existingFacts, llmModel, { ...ctx, leadId })
    .then(async ({ facts, updated }) => {
      if (updated) {
        await saveLeadFacts(leadId, facts);
      }
    })
    .catch(err => {
      console.error("[leadFactsExtractor] save failed:", err);
    });
}

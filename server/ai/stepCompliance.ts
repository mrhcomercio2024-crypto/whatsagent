/**
 * server/ai/stepCompliance.ts
 *
 * Valida se a resposta gerada pela IA cumpriu o objetivo da etapa atual.
 *
 * Camada 1 (heurística pura): rápida, zero custo. Pega 80% dos casos.
 *   - Resposta vazia/curta demais
 *   - Resposta genérica isolada ("ok", "entendi" sozinhos)
 *   - mustNotSay violado
 *   - mustAsk presente mas resposta sem pergunta nem successSignal
 *
 * Camada 2 (LLM mini): só quando o orchestrator pedir explícito (modo strict).
 *
 * Retorno:
 *   { passed: true } -> envia
 *   { passed: false, reason } -> regenera 1x com hint do problema
 */

import { invokeWithModel } from "./invoke";
import { looksRobotic, type ToneProfile } from "./tonePresets";

export type StepInfo = {
  id: number;
  name: string;
  objective?: string | null;
  mustAsk?: string | null; // JSON array string
  mustNotSay?: string | null; // JSON array string
  successSignals?: string | null; // JSON array string
};

export type ComplianceCheck = {
  passed: boolean;
  reason?: string;
  layer: "heuristic" | "llm" | "skip";
};

// ════════════════════════════════════════════════════════════
// Camada 1: heurística pura
// ════════════════════════════════════════════════════════════

const GENERIC_PHRASES = new Set([
  "ok",
  "entendi",
  "perfeito",
  "claro",
  "certo",
  "show",
  "beleza",
  "compreendido",
  "anotado",
  "valeu",
  "obrigado",
  "obrigada",
  "tranquilo",
]);

export function checkHeuristic(
  aiResponse: string,
  step: StepInfo,
  opts: { lastLeadText?: string; toneProfile?: ToneProfile } = {}
): ComplianceCheck {
  const text = (aiResponse || "").trim();
  if (!text) {
    return { passed: false, reason: "resposta vazia", layer: "heuristic" };
  }
  if (text.length < 5) {
    return { passed: false, reason: "resposta curta demais", layer: "heuristic" };
  }
  const norm = text.toLowerCase().replace(/[^a-zà-ú\s]/gi, "").trim();
  const words = norm.split(/\s+/).filter(Boolean);
  // Resposta genérica isolada ("ok", "perfeito") só é problema se a fala anterior do lead
  // não foi também uma confirmação curta. Quando lead disse "sim"/"ok", o agente pode ecoar.
  if (words.length <= 2 && GENERIC_PHRASES.has(words[0])) {
    const leadShortAck = /^(sim|s|ok|blz|beleza|claro|certo|combinado)\.??$/i.test((opts.lastLeadText || "").trim());
    if (!leadShortAck) {
      return { passed: false, reason: `resposta genérica: "${text}"`, layer: "heuristic" };
    }
  }
  // No preset 'natural', o agente NUNCA pode soar robótico.
  if (opts.toneProfile === "natural") {
    const r = looksRobotic(text);
    if (r.robotic) {
      return {
        passed: false,
        reason: `tom robótico/formal detectado (${r.reasons.join(", ")}). Reescreva mais natural, como WhatsApp entre amigos.`,
        layer: "heuristic",
      };
    }
  }

  const mustNotSay = parseArray(step.mustNotSay);
  for (const forbidden of mustNotSay) {
    if (forbidden && text.toLowerCase().includes(forbidden.toLowerCase())) {
      return {
        passed: false,
        reason: `frase proibida no step "${step.name}": "${forbidden}"`,
        layer: "heuristic",
      };
    }
  }

  const mustAsk = parseArray(step.mustAsk);
  const successSignals = parseArray(step.successSignals);

  if (mustAsk.length > 0) {
    const hasQuestion = /\?/.test(text);
    const hasSuccessSignal = successSignals.some(sig => {
      try {
        return new RegExp(sig, "i").test(text);
      } catch {
        return text.toLowerCase().includes(sig.toLowerCase());
      }
    });

    if (!hasQuestion && !hasSuccessSignal) {
      return {
        passed: false,
        reason: `step "${step.name}" exige pergunta (must_ask) ou sinal de sucesso, nenhum encontrado`,
        layer: "heuristic",
      };
    }
  }

  return { passed: true, layer: "heuristic" };
}

// ════════════════════════════════════════════════════════════
// Camada 2: LLM check semântico (opcional)
// ════════════════════════════════════════════════════════════

export async function checkSemanticWithLlm(
  aiResponse: string,
  step: StepInfo,
  leadLastMessage: string,
  llmModel: string = "gpt-4o-mini",
  ctx?: { agentId?: number; conversationId?: number }
): Promise<ComplianceCheck> {
  if (!step.objective) {
    return { passed: true, layer: "skip" };
  }

  const prompt = [
    `Você é avaliador de qualidade de respostas de agente de vendas.`,
    ``,
    `OBJETIVO DA ETAPA: ${step.objective}`,
    ``,
    leadLastMessage
      ? `ÚLTIMA FALA DO LEAD: "${leadLastMessage}"`
      : `(sem fala do lead, agente está iniciando turno)`,
    ``,
    `RESPOSTA DO AGENTE: "${aiResponse}"`,
    ``,
    `A resposta do agente cumpre o objetivo da etapa E reconhece a fala do lead (se houver)?`,
    ``,
    `Responda SOMENTE em JSON, sem nada antes ou depois:`,
    `{"passed": true|false, "reason": "explicação curta se passed=false, vazio se true"}`,
  ].join("\n");

  try {
    const result = await invokeWithModel({
      model: llmModel,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      maxTokens: 200,
      tracking: {
        purpose: "step_compliance",
        agentId: ctx?.agentId,
        conversationId: ctx?.conversationId,
      },
    });

    const cleaned = (result.text || "").replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      passed: !!parsed.passed,
      reason: parsed.passed
        ? undefined
        : String(parsed.reason || "resposta não cumpre objetivo"),
      layer: "llm",
    };
  } catch {
    return { passed: true, reason: "llm check falhou, passou por default", layer: "llm" };
  }
}

// ════════════════════════════════════════════════════════════
// Hint pra regeneração quando falhou
// ════════════════════════════════════════════════════════════

export function buildRegenHint(
  check: ComplianceCheck,
  step: StepInfo,
  leadText: string
): string {
  const mustAsk = parseArray(step.mustAsk);
  const lines: string[] = [];

  lines.push(`PROBLEMA NA RESPOSTA ANTERIOR: ${check.reason || "não cumpriu critério"}.`);
  lines.push(`Reescreva a próxima mensagem corrigindo o problema acima.`);

  if (step.objective) {
    lines.push(`OBJETIVO desta etapa: ${step.objective}`);
  }

  if (leadText && leadText.length > 0) {
    lines.push(`A última fala do lead foi: "${leadText}". Responda primeiro o que ele disse.`);
  }

  if (mustAsk.length > 0) {
    lines.push(
      `Você precisa fazer ao menos uma destas perguntas (adapte à conversa, não copie literal):`
    );
    mustAsk.forEach((q, i) => lines.push(`  ${i + 1}. ${q}`));
  }

  return lines.join("\n");
}

// ════════════════════════════════════════════════════════════
// Helper
// ════════════════════════════════════════════════════════════

function parseArray(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

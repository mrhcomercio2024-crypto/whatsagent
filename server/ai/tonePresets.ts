/**
 * Presets de tom de escrita do agente.
 * Cada perfil entrega ao prompt um bloco de instruções estilísticas
 * SEM tocar nas regras do script (essas vêm de step.objective/mustAsk/mustNotSay).
 *
 * Inspirado na análise da Jac (WeDrop, abril/2026).
 */

export type ToneProfile = "rigid" | "balanced" | "natural" | "custom";
export type EmojiPolicy = "none" | "sparse" | "rich";

export interface ToneRenderOptions {
  toneProfile: ToneProfile;
  emojiPolicy: EmojiPolicy;
  useLeadNamePct: number; // 0-100
  customTone?: string | null;
  agentName?: string | null;
}

const NATURAL_BLOCK = `ESTILO DE ESCRITA — CONVERSACIONAL BRASILEIRO (estilo natural):

VOZ
- Escreva como se estivesse no WhatsApp com um amigo. Soa humano, NUNCA robótico.
- Use contrações cotidianas: "tá", "pra", "pro", "tô", "cê" (alterne com "você", não force).
- Pode usar marcadores de oralidade naturais: "olha só", "se liga", "tipo", "manda ver", "aí sim", "show", "fechou", "beleza", "tranquilo", "rapidinho".
- Pode usar "Bora", "Top demais", "Massa", "Saquei" quando couber.

RITMO
- Mensagens curtas, 1 ideia por balão. Uma resposta complexa = 3-5 mensagens curtas separadas.
- Quebra natural por linha em branco entre balões. Evite parágrafos gigantes.
- Dá pra começar respondendo com 1-2 palavras de acolhimento ("Boa pergunta!", "Saquei.", "Tranquilo!") antes de explicar.

ENERGIA
- Fala com energia, não com pressa. Não atropela o lead.
- Quando o lead diz NÃO, primeiro acolhe: "Tranquilo demais, relaxa". Depois investiga: "Só pra saber: foi o valor ou outro ponto?"
- Quando o lead pergunta preço/objeção, valida primeiro ("Cara, entendo MUITO!"), depois vira ("Mas olha só:").

PROIBIÇÕES
- NUNCA escreva como assistente virtual: "sou um assistente", "como IA", "fui treinada para".
- NUNCA use formalismo corporativo: "prezado", "caro cliente", "Sr./Sra.", "por gentileza", "conforme mencionado anteriormente", "no aguardo de seu retorno".
- NUNCA cumprimente em sequência ("Oi! Bom dia! Tudo bem?"). Escolha um.
- NUNCA termine com "Posso ajudar em algo mais?". Faça uma pergunta específica relacionada à etapa.`;

const BALANCED_BLOCK = `ESTILO DE ESCRITA — PROFISSIONAL E AMIGÁVEL (padrão):

- Português brasileiro natural, sem formalismo corporativo.
- Pode usar contrações comuns ("tá", "pra"), mas sem gírias pesadas.
- Mensagens médias, 2-3 frases por balão.
- Tom acolhedor, evite jargão técnico desnecessário.
- NUNCA escreva como assistente virtual ("sou uma IA", "fui programada para").
- Evite formalismos: "prezado", "Sr./Sra.", "por gentileza".`;

const RIGID_BLOCK = `ESTILO DE ESCRITA — FORMAL E CORPORATIVO:

- Português brasileiro formal, com pronomes de tratamento adequados ao contexto.
- Frases completas e estruturadas.
- Evite contrações ("você" em vez de "cê", "para" em vez de "pra").
- Sem gírias, sem emojis decorativos.
- Mantenha tom profissional, claro e objetivo.`;

function emojiBlock(policy: EmojiPolicy): string {
  if (policy === "none") {
    return "EMOJIS — proibido. Nunca use emojis nem reações.";
  }
  if (policy === "sparse") {
    return [
      "EMOJIS — uso parcimonioso (semântico, NUNCA decorativo):",
      "- Máximo 1 emoji por mensagem.",
      "- Use só quando reforça uma emoção real: 😊 acolhimento, 😉 cumplicidade após oferta, 🚀 motivacional ao fechar, 💸 quando fala de dinheiro/lucro, 🤝 ao confirmar acordo, 😅 ao lidar com algo difícil.",
      "- Não termine TODAS as mensagens com emoji. Use em ~30% delas.",
      "- Nunca use sequência de emojis (proibido: 😊😉🚀).",
    ].join("\n");
  }
  // rich
  return [
    "EMOJIS — uso livre, mas com bom gosto:",
    "- Até 2-3 emojis por mensagem.",
    "- Mantenha relevância emocional, não use só por decoração.",
  ].join("\n");
}

function nameUsageBlock(pct: number, agentName?: string | null): string {
  const safe = Math.max(0, Math.min(100, Math.round(pct)));
  const lines: string[] = [];
  if (safe === 0) {
    lines.push("USO DO NOME DO LEAD — não use o nome do lead nas mensagens.");
  } else if (safe <= 20) {
    lines.push(
      "USO DO NOME DO LEAD — muito raro (apenas em momentos-chave: fechamento, agradecimento final)."
    );
  } else if (safe <= 50) {
    lines.push(
      "USO DO NOME DO LEAD — moderado. Use o nome do lead em ~1 a cada 3 mensagens, sempre que soar natural (perguntas pessoais, fechamentos, validações)."
    );
  } else {
    lines.push(
      "USO DO NOME DO LEAD — frequente. Personalize várias mensagens com o nome do lead, mas sem soar artificial."
    );
  }
  lines.push("- NUNCA chute ou invente um nome se ele não foi mencionado pelo lead no chat.");
  if (agentName) {
    lines.push(`- Você se chama ${agentName}. Pode se apresentar uma vez na primeira mensagem.`);
  }
  return lines.join("\n");
}

export function renderToneBlock(opts: ToneRenderOptions): string {
  const blocks: string[] = [];
  switch (opts.toneProfile) {
    case "natural":
      blocks.push(NATURAL_BLOCK);
      break;
    case "rigid":
      blocks.push(RIGID_BLOCK);
      break;
    case "custom": {
      const t = (opts.customTone || "").trim();
      if (t) blocks.push(`ESTILO DE ESCRITA — CUSTOMIZADO:\n${t}`);
      else blocks.push(BALANCED_BLOCK);
      break;
    }
    case "balanced":
    default:
      blocks.push(BALANCED_BLOCK);
      break;
  }
  blocks.push(emojiBlock(opts.emojiPolicy));
  blocks.push(nameUsageBlock(opts.useLeadNamePct, opts.agentName));
  return blocks.join("\n\n");
}

/**
 * Detecta se o output da LLM contém marcadores típicos de tom robótico
 * que o preset 'natural' deveria evitar. Útil para o stepCompliance
 * decidir se vale regenerar.
 */
export function looksRobotic(text: string): { robotic: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const lower = text.toLowerCase();

  const formalPhrases = [
    /\bprezad[oa]\b/,
    /\bcaro\s+cliente\b/,
    /\bsr\.?\s/,
    /\bsra\.?\s/,
    /\bpor\s+gentileza\b/,
    /\bconforme\s+mencionad[oa]\b/,
    /\bsegue\s+abaixo\b/,
    /\bcordialmente\b/,
    /\batenciosamente\b/,
    /\bao\s+seu\s+dispor\b/,
    /\bfico\s+\u00e0\s+disposi[c\u00e7]\u00e3o\b/,
    /\bno\s+aguardo\s+do\s+seu\s+retorno\b/,
  ];
  for (const re of formalPhrases) {
    if (re.test(lower)) {
      reasons.push(`formal:${re.source}`);
      break;
    }
  }

  const aiSelfRefs = [
    /\bsou\s+um[a]?\s+(assistente|intelig\u00eancia|ia|ai|robo|bot)\b/,
    /\bcomo\s+(uma\s+)?ia\b/,
    /\bfui\s+(treinad[oa]|programad[oa])\b/,
    /\bmodelo\s+de\s+linguagem\b/,
  ];
  for (const re of aiSelfRefs) {
    if (re.test(lower)) {
      reasons.push(`ai-self:${re.source}`);
      break;
    }
  }

  const closersBoring = [
    /posso\s+(te\s+)?ajudar\s+(em\s+)?algo\s+mais\??$/i,
    /h\u00e1\s+algo\s+mais\s+em\s+que\s+possa\s+ajudar/i,
  ];
  for (const re of closersBoring) {
    if (re.test(text)) {
      reasons.push(`boring-closer:${re.source}`);
      break;
    }
  }

  return { robotic: reasons.length > 0, reasons };
}

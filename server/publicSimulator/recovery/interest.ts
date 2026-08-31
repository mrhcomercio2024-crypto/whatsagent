export type InterestSignal = {
  code: string;
  label: string;
  points: number;
};

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAny(text: string, expressions: RegExp[]) {
  return expressions.some(expression => expression.test(text));
}

export function scoreObjectiveInterest(input: {
  inboundTexts: string[];
  interactionCount: number;
  temperature?: "hot" | "warm" | "cold" | "unknown" | null;
  advancedStage?: boolean;
  previousLeadScore?: number | null;
  scoreThreshold: number;
}) {
  const text = normalize(input.inboundTexts.join(" \n "));
  const signals: InterestSignal[] = [];
  const add = (code: string, label: string, points: number) => {
    if (!signals.some(signal => signal.code === code)) signals.push({ code, label, points });
  };

  if (input.interactionCount >= 4) add("interactions_4_plus", "4 ou mais interações", 20);
  if (hasAny(text, [/\bpreco\b/, /\bvalor\b/, /\binvestimento\b/, /quanto custa/, /formas? de pagamento/])) {
    add("asked_price", "Perguntou sobre preço", 20);
  }
  if (hasAny(text, [/como funciona/, /como comecar/, /como que e/, /qual o processo/, /como opera/])) {
    add("asked_how_it_works", "Perguntou como funciona", 15);
  }
  if (hasAny(text, [/marketplace/, /mercado livre/, /shopee/, /amazon/, /magalu/, /onde (?:eu )?vendo/])) {
    add("asked_marketplace", "Perguntou sobre marketplaces", 15);
  }
  if (hasAny(text, [/prova/, /case/, /caso real/, /resultado/, /depoimento/, /funciona mesmo/, /garantia/])) {
    add("asked_proof", "Pediu prova ou case", 15);
  }
  if (hasAny(text, [/quero o link/, /manda o link/, /me passa o link/, /quero comprar/, /abrir checkout/])) {
    add("cta_intent", "Pediu ou demonstrou intenção de clicar no CTA", 25);
  }
  if (hasAny(text, [/me avisa/, /pode me avisar/, /quero receber avis/, /manda uma notific/, /me lembra depois/])) {
    add("requested_alerts", "Pediu explicitamente para receber avisos", 25);
  }
  if (input.advancedStage) add("advanced_stage", "Está em estágio comercial avançado", 15);
  if (input.temperature === "warm") add("warm_lead", "Lead classificado como morno", 10);
  if (input.temperature === "hot") add("hot_lead", "Lead classificado como quente", 20);

  const objectiveScore = Math.min(100, signals.reduce((total, signal) => total + signal.points, 0));
  const score = Math.max(objectiveScore, input.previousLeadScore || 0);
  if (score >= input.scoreThreshold) {
    add("lead_score_threshold", "Lead score acima do limite configurado", 0);
  }
  return {
    score,
    signals,
    eligible: input.interactionCount >= 4 && score >= input.scoreThreshold,
  };
}

export function isStrongInterest(input: {
  score: number;
  strongThreshold: number;
  signals: InterestSignal[];
  explicitlyRequestedAlerts?: boolean;
}) {
  if (input.explicitlyRequestedAlerts) return true;
  const decisive = new Set(["asked_price", "asked_proof", "cta_intent", "requested_alerts", "advanced_stage", "hot_lead"]);
  return input.score >= input.strongThreshold && input.signals.some(signal => decisive.has(signal.code));
}

export function isPushOptOutMessage(text: string) {
  return /\b(?:pare|parar|nao me avise|não me avise|nao quero receber|não quero receber|desativar notificacoes|desativar notificações|cancelar avisos|sem notificacao|sem notificação)\b/i.test(
    text,
  );
}

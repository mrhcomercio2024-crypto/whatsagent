export type HumanTypingTiming = {
  typingSimulationEnabled: boolean;
  typingCps: number;
  typingMinDelayMs: number;
  typingMaxDelayMs: number;
  interMessageDelayMs: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/** Tempo natural de digitação: tamanho + pontuação + pequena variação humana. */
export function calculateHumanTypingDelay(
  text: string,
  timing: HumanTypingTiming,
  random = Math.random(),
) {
  if (!timing.typingSimulationEnabled) return 250;
  const clean = text.trim();
  const cps = clamp(timing.typingCps || 18, 8, 45);
  const punctuationPauses = (clean.match(/[,.!?;:]/g) || []).length * 105;
  const linePauses = (clean.match(/\n/g) || []).length * 180;
  const jitter = 0.88 + clamp(random, 0, 1) * 0.24;
  const estimated = (clean.length / cps) * 1000 * jitter + punctuationPauses + linePauses;
  return Math.round(
    clamp(estimated, Math.max(500, timing.typingMinDelayMs), timing.typingMaxDelayMs),
  );
}

/** Antes de cada balão, o humano faz uma pausa curta para organizar a ideia. */
export function calculateHumanPreparationDelay(index: number, random = Math.random()) {
  const base = index === 0 ? 420 : 650;
  const variation = index === 0 ? 480 : 700;
  return Math.round(base + clamp(random, 0, 1) * variation);
}

/** Entre balões o status volta brevemente a online antes da próxima digitação. */
export function calculateHumanInterMessageDelay(
  configuredMs: number,
  random = Math.random(),
) {
  const baseline = Math.max(650, configuredMs || 900);
  return Math.round(clamp(baseline * (0.82 + clamp(random, 0, 1) * 0.36), 650, 3200));
}


/**
 * Determina se um instante (geralmente "agora") está dentro da janela
 * permitida [startHour, endHour) e, caso contrário, devolve o próximo
 * instante válido (epoch ms) onde o disparo pode ocorrer.
 *
 * Convenções:
 * - startHour e endHour são inteiros 0..23, no fuso do servidor.
 * - Se ambos null/undefined, não há restrição → sempre permitido.
 * - endHour > startHour: janela não-cruza-meia-noite (ex 8..21).
 * - endHour <= startHour: janela cruza meia-noite (ex 22..6).
 * - Se startHour === endHour: tratado como "qualquer hora" (sem restrição prática).
 */

export type TimeWindow = {
  startHour: number | null | undefined;
  endHour: number | null | undefined;
};

export function isWithinAllowedWindow(now: Date, win: TimeWindow): boolean {
  const s = win.startHour;
  const e = win.endHour;
  if (s == null || e == null) return true;
  if (s === e) return true;
  const h = now.getHours();
  if (s < e) {
    return h >= s && h < e;
  }
  // Cruza meia-noite: [s..23] ∪ [0..e)
  return h >= s || h < e;
}

/**
 * Devolve o instante (timestamp ms) do próximo `startHour` válido para o disparo.
 * Se já está dentro da janela, devolve `now` (epoch ms).
 */
export function nextAllowedAt(now: Date, win: TimeWindow): number {
  const s = win.startHour;
  const e = win.endHour;
  if (s == null || e == null || s === e) return now.getTime();
  if (isWithinAllowedWindow(now, win)) return now.getTime();
  // Construir o próximo startHour: hoje às s:00:00 se ainda for futuro, senão amanhã.
  const candidate = new Date(now);
  candidate.setHours(s, 0, 0, 0);
  if (candidate.getTime() <= now.getTime()) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate.getTime();
}

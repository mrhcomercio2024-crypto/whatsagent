/**
 * Comando interno do operador para zerar a conversa.
 *
 * Aceita as variações mais comuns para evitar falso negativo quando
 * digitamos no celular: `/limpar`, `/clear`, `/reset`, `/start`,
 * com ou sem espaços, com ou sem maiúsculas.
 *
 * Importante: só dispara quando a mensagem inteira é o comando — assim
 * não corremos risco de um lead acidentalmente apagar a conversa.
 */

const RESET_PATTERNS = [
  /^\s*\/limpar\s*$/i,
  /^\s*\/clear\s*$/i,
  /^\s*\/reset\s*$/i,
  /^\s*\/start\s*$/i,
  /^\s*\/restart\s*$/i,
];

export function isResetCommand(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = String(text);
  return RESET_PATTERNS.some(re => re.test(t));
}

export const RESET_REPLY =
  "Conversa zerada. Histórico, resumo e etapa do script foram reiniciados. Pode começar do zero.";

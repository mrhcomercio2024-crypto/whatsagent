/**
 * Wrapper bcrypt para hash/verificação de senhas locais (login email/senha).
 *
 * Usa bcryptjs (puro JS, sem dependências nativas) com 10 rounds —
 * compromisso aceitável entre custo CPU em produção e resistência a brute force.
 */
import bcrypt from "bcryptjs";

const ROUNDS = 10;

/** Política mínima de senha: 8+ chars, ao menos 1 letra e 1 dígito. */
export function isStrongEnough(password: string): boolean {
  if (typeof password !== "string") return false;
  if (password.length < 8) return false;
  if (!/[A-Za-z]/.test(password)) return false;
  if (!/\d/.test(password)) return false;
  return true;
}

/** Gera hash bcrypt da senha em texto plano. */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

/** Verifica senha contra hash. Retorna false em qualquer erro/entrada inválida. */
export async function verifyPassword(
  plain: string | null | undefined,
  hash: string | null | undefined,
): Promise<boolean> {
  if (!plain || !hash) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

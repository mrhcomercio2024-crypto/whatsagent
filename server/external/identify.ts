/**
 * Identificação de leads a partir de payloads externos heterogêneos
 * (Hotmart, Shopify, Kiwify, Cakto, etc.). Aceita telefone OU email
 * e procura em campos comuns recursivamente.
 */

const PHONE_FIELDS = [
  "phone",
  "phoneNumber",
  "phone_number",
  "telefone",
  "celular",
  "whatsapp",
  "whatsapp_number",
  "mobile",
  "mobile_phone",
  "cellphone",
  "buyer_phone",
  "customer_phone",
  "to",
  "msisdn",
];

const EMAIL_FIELDS = [
  "email",
  "e_mail",
  "buyer_email",
  "customer_email",
  "user_email",
  "mail",
];

const NAME_FIELDS = [
  "name",
  "fullname",
  "full_name",
  "nome",
  "buyer_name",
  "customer_name",
  "first_name",
];

/**
 * Normaliza telefone para formato BR esperado pelo WhatsApp:
 * - mantém apenas dígitos
 * - se vier sem DDI, prefixa "55"
 * - aceita 10, 11, 12, 13 dígitos (com ou sem 9, com ou sem DDI)
 */
export function normalizePhoneBR(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;

  // remove zero internacional (00…)
  if (digits.startsWith("00")) digits = digits.slice(2);

  // já vem com 55 (12 ou 13 dígitos: 55 + DDD(2) + número(8 ou 9))
  if (digits.length >= 12 && digits.startsWith("55")) {
    return digits;
  }
  // 10 (DDD+8) ou 11 (DDD+9) dígitos: prefixa 55
  if (digits.length === 10 || digits.length === 11) {
    return "55" + digits;
  }
  // já tem 12+ dígitos mas não começa com 55: assume número internacional como veio
  if (digits.length >= 11) {
    return digits;
  }
  // muito curto (<10): inválido
  return null;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s.includes("@")) return null;
  return s;
}

/** Busca recursiva por uma chave (case-insensitive) num objeto JSON arbitrário. */
function findFieldDeep(obj: any, candidates: string[]): string | null {
  if (obj == null) return null;
  if (typeof obj !== "object") return null;
  const lowerCands = candidates.map((c) => c.toLowerCase());
  // BFS
  const queue: any[] = [obj];
  while (queue.length > 0) {
    const node = queue.shift();
    if (node == null || typeof node !== "object") continue;
    for (const key of Object.keys(node)) {
      const val = (node as any)[key];
      if (lowerCands.includes(key.toLowerCase())) {
        if (typeof val === "string" && val.trim()) return val.trim();
        if (typeof val === "number") return String(val);
      }
      if (val && typeof val === "object") queue.push(val);
    }
  }
  return null;
}

export type IdentifierExtraction = {
  phone: string | null;
  email: string | null;
  name: string | null;
  /** Identificador efetivo (preferência: telefone normalizado > email) */
  primary: string | null;
  /** Tipo do primary */
  primaryKind: "phone" | "email" | null;
};

/**
 * Extrai identificadores do payload bruto.
 * Override: caso o payload tenha sido pré-mapeado (campos `phone`, `email`,
 * `name` no nível raiz), eles têm precedência.
 */
export function extractIdentifiers(payload: unknown): IdentifierExtraction {
  const root: any = payload && typeof payload === "object" ? payload : {};
  const rawPhone =
    (typeof root.phone === "string" ? root.phone : undefined) ??
    findFieldDeep(root, PHONE_FIELDS);
  const rawEmail =
    (typeof root.email === "string" ? root.email : undefined) ??
    findFieldDeep(root, EMAIL_FIELDS);
  const rawName =
    (typeof root.name === "string" ? root.name : undefined) ??
    findFieldDeep(root, NAME_FIELDS);
  const phone = normalizePhoneBR(rawPhone ?? null);
  const email = normalizeEmail(rawEmail ?? null);
  const name = rawName ? String(rawName).trim().slice(0, 200) : null;
  const primary = phone ?? email ?? null;
  const primaryKind = phone ? "phone" : email ? "email" : null;
  return { phone, email, name, primary, primaryKind };
}

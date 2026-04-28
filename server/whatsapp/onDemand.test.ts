import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * Regressão da Fase 78:
 *
 * A conexão Baileys é estritamente on-demand: o QR só pode ser gerado quando
 * o usuário clica "Iniciar conexão" na UI. Não pode haver chamada a
 * `startQrSession`, `reconnectAllQrSessions` ou `startBaileysLifecycle`
 * dentro do bootstrap do servidor (`server/_core/index.ts`).
 *
 * Estes testes leem o arquivo de boot como string e garantem que essas
 * chamadas estejam comentadas/removidas. Funciona como uma "trava de lint"
 * permanente: qualquer tentativa futura de re-introduzir auto-start será
 * pega aqui.
 */
describe("Baileys on-demand contract (Fase 78)", () => {
  const bootPath = path.resolve(
    __dirname,
    "..",
    "_core",
    "index.ts",
  );
  const bootSrc = fs.readFileSync(bootPath, "utf-8");

  it("não chama reconnectAllQrSessions() no boot", () => {
    // Procura chamadas (com parênteses), não a importação ou comentários.
    const callPattern = /^\s*reconnectAllQrSessions\s*\(/m;
    expect(callPattern.test(bootSrc)).toBe(false);
  });

  it("não chama startBaileysLifecycle() no boot", () => {
    const callPattern = /^\s*startBaileysLifecycle\s*\(/m;
    expect(callPattern.test(bootSrc)).toBe(false);
  });

  it("não chama startQrSession() no boot", () => {
    const callPattern = /^\s*startQrSession\s*\(/m;
    expect(callPattern.test(bootSrc)).toBe(false);
  });

  it("anuncia explicitamente o modo on-demand no log de boot", () => {
    expect(bootSrc).toContain("auto-start desabilitado");
  });
});

/**
 * Garantia de que onClose do Baileys NÃO agenda reconnect automático.
 * O scheduleReconnect() (no caso de queda) foi removido na Fase 78 —
 * agora só conectamos quando o usuário clica de novo.
 */
describe("Baileys onClose não agenda reconnect (Fase 78)", () => {
  const baileysPath = path.resolve(__dirname, "baileys.ts");
  const src = fs.readFileSync(baileysPath, "utf-8");

  it("não chama scheduleReconnect dentro do bloco de quedas temporárias", () => {
    // Procuramos o bloco "Quedas temporárias / desconectado" — antes tinha
    // scheduleReconnect(...). Após a Fase 78, esse bloco só marca disconnected
    // e cancela qualquer reconnect pendente. Verificamos que a string ficou
    // referenciada apenas em código de cancelamento.
    const block = src.split("// Quedas")[1] ?? "";
    expect(block.includes("scheduleReconnect(")).toBe(false);
  });

  it("usa cancelReconnect() para garantir que nada agendado sobrevive", () => {
    expect(src).toMatch(/cancelReconnect\(agentId\)/);
  });

  it("registra explicitamente que aguarda clique manual", () => {
    expect(src).toMatch(/aguardando clique manual/);
  });
});

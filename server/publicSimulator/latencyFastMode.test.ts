import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildMessages, buildSystemPrompt, type PromptContext } from "../ai/prompt";

function context(fastMode: boolean): PromptContext {
  const long = (label: string, size: number) => `${label}:` + " conteúdo confiável".repeat(size);
  const history = Array.from({ length: 22 }, (_, index) => ({
    id: index + 1,
    conversationId: 1,
    direction: index % 2 ? "outbound" : "inbound",
    sender: index % 2 ? "ai" : "lead",
    contentType: "text",
    body: `mensagem ${index + 1}`,
    mediaUrl: null,
    waMessageId: null,
    metadata: null,
    createdAt: new Date(),
  })) as any;
  return {
    fastMode,
    agent: { id: 1, name: "Ravi", persona: "Vendedor consultivo", toneProfile: "natural" } as any,
    brain: {
      id: 1,
      agentId: 1,
      masterPrompt: long("master", 900),
      tone: "Natural e breve",
      rules: long("rules", 350),
      products: long("products", 300),
      objections: long("objections", 500),
      companyInfo: long("company", 450),
    } as any,
    steps: [],
    currentStep: undefined,
    knowledge: [],
    availableMedia: [],
    history,
  };
}

describe("Ravi Web fast mode latency budget", () => {
  it("compacts redundant brain blocks while preserving head, tail and hard rules", () => {
    const normal = buildSystemPrompt(context(false));
    const fast = buildSystemPrompt(context(true));
    expect(fast.length).toBeLessThan(normal.length * 0.65);
    expect(fast).toContain("trecho intermediário condensado");
    expect(fast).toContain("master:");
    expect(fast).toContain("REGRAS INVIOLÁVEIS");
  });

  it("limits fast-mode history to 14 messages without changing normal mode", () => {
    expect(buildMessages(context(true))).toHaveLength(15);
    expect(buildMessages(context(false))).toHaveLength(23);
  });

  it("caps artificial browser delays without changing global agent values", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "server/publicSimulator/router.ts"), "utf8");
    expect(source).toContain("Math.min(agent.debounceSeconds, 2)");
    expect(source).toContain("Math.max(agent.typingCps, 16)");
    expect(source).toContain("Math.min(agent.typingMaxDelayMs, 3500)");
    expect(source).toContain("Math.min(agent.interMessageDelayMs, 850)");
  });

  it("skips the extra status-classifier round trip only in simulation mode", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "server/ai/orchestrator.ts"), "utf8");
    expect(source).toContain("if (!opts.isSimulation)");
    expect(source).toContain("fastMode: Boolean(opts.isSimulation)");
    expect(source).toContain("maxTokens: opts.isSimulation ? 500 : 800");
  });
});

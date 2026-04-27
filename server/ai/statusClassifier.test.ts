import { describe, it, expect, vi, beforeEach } from "vitest";
import { classifyLeadStatus } from "./statusClassifier";
import type { LeadStatusRule } from "../../drizzle/schema";

vi.mock("./invoke", () => ({
  invokeWithModel: vi.fn(),
}));
import { invokeWithModel } from "./invoke";

const mockInvoke = invokeWithModel as unknown as ReturnType<typeof vi.fn>;

function rule(partial: Partial<LeadStatusRule>): LeadStatusRule {
  return {
    id: 1,
    agentId: 1,
    slug: "membro_wedrop",
    label: "Já é membro WeDrop",
    description: "Lead menciona que já é aluno, comprou, tem acesso",
    isBlocking: true,
    replyWhenBlocked: "Você já é membro.",
    handoffOnMatch: true,
    notifyOwnerOnMatch: true,
    badgeColor: "amber",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  } as LeadStatusRule;
}

describe("classifyLeadStatus", () => {
  beforeEach(() => mockInvoke.mockReset());

  it("retorna none quando não há regras ativas", async () => {
    const r = await classifyLeadStatus({
      rules: [],
      history: [],
      lastInboundText: "oi",
    });
    expect(r.slug).toBeNull();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("retorna none quando mensagem do lead é vazia", async () => {
    const r = await classifyLeadStatus({
      rules: [rule({})],
      history: [],
      lastInboundText: "   ",
    });
    expect(r.slug).toBeNull();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("retorna slug quando LLM identifica uma regra válida", async () => {
    mockInvoke.mockResolvedValueOnce({
      text: JSON.stringify({ slug: "membro_wedrop", reason: "disse que já comprou" }),
      raw: {},
    });
    const r = await classifyLeadStatus({
      rules: [rule({})],
      history: [],
      lastInboundText: "já sou aluno da WeDrop",
    });
    expect(r.slug).toBe("membro_wedrop");
    expect(r.reason).toMatch(/já comprou/);
  });

  it("retorna none quando LLM devolve slug inexistente (evita alucinação)", async () => {
    mockInvoke.mockResolvedValueOnce({
      text: JSON.stringify({ slug: "inexistente_xyz", reason: "hmm" }),
      raw: {},
    });
    const r = await classifyLeadStatus({
      rules: [rule({})],
      history: [],
      lastInboundText: "alguma coisa",
    });
    expect(r.slug).toBeNull();
    expect(r.reason).toMatch(/inválido/i);
  });

  it("retorna none quando LLM devolve 'none'", async () => {
    mockInvoke.mockResolvedValueOnce({
      text: JSON.stringify({ slug: "none", reason: "nada claro" }),
      raw: {},
    });
    const r = await classifyLeadStatus({
      rules: [rule({})],
      history: [],
      lastInboundText: "quero saber mais",
    });
    expect(r.slug).toBeNull();
  });

  it("não quebra em caso de falha do LLM", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("timeout"));
    const r = await classifyLeadStatus({
      rules: [rule({})],
      history: [],
      lastInboundText: "teste",
    });
    expect(r.slug).toBeNull();
    expect(r.reason).toMatch(/falha/i);
  });

  it("ignora regras inativas", async () => {
    const r = await classifyLeadStatus({
      rules: [rule({ isActive: false })],
      history: [],
      lastInboundText: "já sou aluno",
    });
    expect(r.slug).toBeNull();
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

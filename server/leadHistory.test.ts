import { describe, expect, it } from "vitest";

/**
 * Testa a transformação pura que o getLeadHistory aplica sobre rows de messages
 * e metrics_events. Como o helper real depende de DB, isolamos a lógica de
 * mapping/ordenação em uma função idêntica aqui (mesma forma usada no db.ts).
 */

type Msg = {
  id: number;
  direction: "inbound" | "outbound";
  sender: "lead" | "ai" | "human" | "system";
  contentType: "text" | "image" | "video" | "audio" | "document" | "template";
  body: string | null;
  templateName: string | null;
  createdAt: Date;
};

type MetricRow = {
  id: number;
  eventType: string;
  metadata: any;
  createdAt: Date;
};

type Event = {
  id: string;
  kind: string;
  at: Date;
  title: string;
  detail: string | null;
};

function buildTimeline(msgs: Msg[], metrics: MetricRow[]): Event[] {
  const events: Event[] = [];
  for (const m of msgs) {
    let kind = "message_in";
    let title = "Mensagem recebida";
    if (m.direction === "outbound") {
      if (m.contentType === "template") {
        kind = "message_template";
        title = m.templateName ? `Template enviado: ${m.templateName}` : "Template enviado";
      } else if (m.sender === "ai") {
        kind = "message_out_ai";
        title = "IA respondeu";
      } else {
        kind = "message_out_human";
        title = "Atendente respondeu";
      }
    }
    const detail = m.body
      ? m.body.length > 160
        ? m.body.slice(0, 157) + "…"
        : m.body
      : m.contentType === "image"
        ? "[imagem]"
        : null;
    events.push({ id: `msg-${m.id}`, kind, at: m.createdAt, title, detail });
  }
  for (const e of metrics) {
    const t = (e.eventType || "").toLowerCase();
    if (t === "step_advance") {
      events.push({
        id: `ev-${e.id}`,
        kind: "step_advance",
        at: e.createdAt,
        title: "Avançou de etapa",
        detail: e.metadata?.label ?? null,
      });
    } else if (t === "handoff") {
      events.push({
        id: `ev-${e.id}`,
        kind: "handoff",
        at: e.createdAt,
        title: "Handoff para humano",
        detail: e.metadata?.reason ?? null,
      });
    } else if (t === "status_tag_assigned") {
      events.push({
        id: `ev-${e.id}`,
        kind: "status_tag",
        at: e.createdAt,
        title: "Tag de status atribuída",
        detail: e.metadata?.slug ?? null,
      });
    }
  }
  events.sort((a, b) => b.at.getTime() - a.at.getTime());
  return events;
}

describe("lead history timeline", () => {
  const t = (iso: string) => new Date(iso);

  it("agrupa mensagens inbound e outbound com kinds corretos", () => {
    const evts = buildTimeline(
      [
        {
          id: 1,
          direction: "inbound",
          sender: "lead",
          contentType: "text",
          body: "Olá",
          templateName: null,
          createdAt: t("2026-04-20T10:00:00Z"),
        },
        {
          id: 2,
          direction: "outbound",
          sender: "ai",
          contentType: "text",
          body: "Oi! Tudo bem?",
          templateName: null,
          createdAt: t("2026-04-20T10:00:30Z"),
        },
        {
          id: 3,
          direction: "outbound",
          sender: "human",
          contentType: "text",
          body: "Aqui é o João",
          templateName: null,
          createdAt: t("2026-04-20T10:02:00Z"),
        },
      ],
      []
    );
    const kinds = evts.map(e => e.kind);
    expect(kinds).toEqual(["message_out_human", "message_out_ai", "message_in"]);
  });

  it("identifica template por contentType", () => {
    const evts = buildTimeline(
      [
        {
          id: 5,
          direction: "outbound",
          sender: "ai",
          contentType: "template",
          body: null,
          templateName: "boas_vindas",
          createdAt: t("2026-04-20T09:00:00Z"),
        },
      ],
      []
    );
    expect(evts[0].kind).toBe("message_template");
    expect(evts[0].title).toContain("boas_vindas");
  });

  it("trunca corpo longo com elipse", () => {
    const longBody = "a".repeat(300);
    const evts = buildTimeline(
      [
        {
          id: 9,
          direction: "inbound",
          sender: "lead",
          contentType: "text",
          body: longBody,
          templateName: null,
          createdAt: t("2026-04-20T09:00:00Z"),
        },
      ],
      []
    );
    expect(evts[0].detail?.endsWith("…")).toBe(true);
    expect(evts[0].detail?.length).toBeLessThanOrEqual(161);
  });

  it("placeholder [imagem] quando mensagem sem body", () => {
    const evts = buildTimeline(
      [
        {
          id: 10,
          direction: "inbound",
          sender: "lead",
          contentType: "image",
          body: null,
          templateName: null,
          createdAt: t("2026-04-20T09:00:00Z"),
        },
      ],
      []
    );
    expect(evts[0].detail).toBe("[imagem]");
  });

  it("agrega metrics step_advance, handoff e status_tag", () => {
    const evts = buildTimeline(
      [],
      [
        {
          id: 1,
          eventType: "step_advance",
          metadata: { label: "Apresentar oferta" },
          createdAt: t("2026-04-20T11:00:00Z"),
        },
        {
          id: 2,
          eventType: "handoff",
          metadata: { reason: "keyword" },
          createdAt: t("2026-04-20T11:05:00Z"),
        },
        {
          id: 3,
          eventType: "status_tag_assigned",
          metadata: { slug: "membro_wedrop" },
          createdAt: t("2026-04-20T11:10:00Z"),
        },
      ]
    );
    expect(evts).toHaveLength(3);
    expect(evts[0].kind).toBe("status_tag");
    expect(evts[0].detail).toBe("membro_wedrop");
    expect(evts[1].kind).toBe("handoff");
    expect(evts[2].kind).toBe("step_advance");
  });

  it("ordena desc pelo horário quando mistura fontes", () => {
    const evts = buildTimeline(
      [
        {
          id: 1,
          direction: "inbound",
          sender: "lead",
          contentType: "text",
          body: "cedo",
          templateName: null,
          createdAt: t("2026-04-20T09:00:00Z"),
        },
        {
          id: 2,
          direction: "outbound",
          sender: "ai",
          contentType: "text",
          body: "tarde",
          templateName: null,
          createdAt: t("2026-04-20T11:00:00Z"),
        },
      ],
      [
        {
          id: 1,
          eventType: "step_advance",
          metadata: { label: "x" },
          createdAt: t("2026-04-20T10:00:00Z"),
        },
      ]
    );
    const times = evts.map(e => e.at.getTime());
    expect(times[0]).toBeGreaterThan(times[1]);
    expect(times[1]).toBeGreaterThan(times[2]);
  });

  it("ignora metrics de tipos não mapeados", () => {
    const evts = buildTimeline(
      [],
      [
        {
          id: 1,
          eventType: "response_time_ms",
          metadata: {},
          createdAt: t("2026-04-20T10:00:00Z"),
        },
        {
          id: 2,
          eventType: "tokens_used",
          metadata: {},
          createdAt: t("2026-04-20T10:00:01Z"),
        },
      ]
    );
    expect(evts).toHaveLength(0);
  });
});

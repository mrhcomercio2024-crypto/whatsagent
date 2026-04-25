import { describe, it, expect } from "vitest";

/**
 * Replica a lógica que o Simulator.tsx usa para mapear o resultado
 * de `trpc.simulator.history` em ChatItems do mock-up. Garante que:
 *  - Mensagens inbound viram bolha do usuário
 *  - Mensagens outbound de texto viram bolha do bot com `text`
 *  - Mensagens outbound de mídia viram bolha do bot com `mediaType`/`mediaUrl`
 *  - `createdAt` é convertido para timestamp numérico
 *  - quando a query devolve `conversationId: null`, não há nada a mapear
 */
type ServerMsg = {
  id: number;
  direction: "inbound" | "outbound";
  sender: string;
  contentType: string;
  body: string | null;
  mediaUrl: string | null;
  mediaId: number | null;
  createdAt: string | null;
};

type Mapped =
  | { kind: "user"; id: string; text: string; ts: number }
  | {
      kind: "bot";
      id: string;
      text?: string;
      mediaType?: "image" | "video" | "audio" | "document";
      mediaUrl?: string | null;
      caption?: string | null;
      ts: number;
    };

function mapHistory(payload: {
  conversationId: number | null;
  messages: ServerMsg[];
}): Mapped[] {
  if (!payload.conversationId) return [];
  return payload.messages.map(m => {
    const ts = m.createdAt ? new Date(m.createdAt).getTime() : 0;
    if (m.direction === "inbound") {
      return {
        kind: "user" as const,
        id: `srv-${m.id}`,
        text: m.body ?? "",
        ts,
      };
    }
    const isMedia =
      m.contentType === "image" ||
      m.contentType === "video" ||
      m.contentType === "audio" ||
      m.contentType === "document";
    return {
      kind: "bot" as const,
      id: `srv-${m.id}`,
      text: !isMedia ? (m.body ?? "") : undefined,
      mediaType: isMedia
        ? (m.contentType as "image" | "video" | "audio" | "document")
        : undefined,
      mediaUrl: isMedia ? m.mediaUrl : undefined,
      caption: isMedia ? m.body : undefined,
      ts,
    };
  });
}

describe("simulator history mapping", () => {
  it("retorna lista vazia quando não há conversa persistida", () => {
    expect(mapHistory({ conversationId: null, messages: [] })).toEqual([]);
  });

  it("mapeia mensagens inbound como bolha do usuário", () => {
    const out = mapHistory({
      conversationId: 7,
      messages: [
        {
          id: 1,
          direction: "inbound",
          sender: "lead",
          contentType: "text",
          body: "oi",
          mediaUrl: null,
          mediaId: null,
          createdAt: "2026-01-01T12:00:00.000Z",
        },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("user");
    if (out[0].kind === "user") {
      expect(out[0].text).toBe("oi");
      expect(out[0].id).toBe("srv-1");
      expect(out[0].ts).toBe(new Date("2026-01-01T12:00:00.000Z").getTime());
    }
  });

  it("mapeia outbound de texto como bolha do bot com text", () => {
    const out = mapHistory({
      conversationId: 7,
      messages: [
        {
          id: 2,
          direction: "outbound",
          sender: "ai",
          contentType: "text",
          body: "olá!",
          mediaUrl: null,
          mediaId: null,
          createdAt: "2026-01-01T12:01:00.000Z",
        },
      ],
    });
    expect(out[0].kind).toBe("bot");
    if (out[0].kind === "bot") {
      expect(out[0].text).toBe("olá!");
      expect(out[0].mediaType).toBeUndefined();
      expect(out[0].mediaUrl).toBeUndefined();
    }
  });

  it("mapeia outbound de mídia como bolha do bot com mediaType e mediaUrl", () => {
    const out = mapHistory({
      conversationId: 7,
      messages: [
        {
          id: 3,
          direction: "outbound",
          sender: "ai",
          contentType: "image",
          body: "legenda",
          mediaUrl: "/manus-storage/x.png",
          mediaId: 99,
          createdAt: "2026-01-01T12:02:00.000Z",
        },
      ],
    });
    expect(out[0].kind).toBe("bot");
    if (out[0].kind === "bot") {
      expect(out[0].text).toBeUndefined();
      expect(out[0].mediaType).toBe("image");
      expect(out[0].mediaUrl).toBe("/manus-storage/x.png");
      expect(out[0].caption).toBe("legenda");
    }
  });

  it("preserva ordem e gera ids estáveis (srv-<id>)", () => {
    const out = mapHistory({
      conversationId: 1,
      messages: [
        { id: 10, direction: "inbound", sender: "lead", contentType: "text", body: "a", mediaUrl: null, mediaId: null, createdAt: null },
        { id: 11, direction: "outbound", sender: "ai", contentType: "text", body: "b", mediaUrl: null, mediaId: null, createdAt: null },
        { id: 12, direction: "inbound", sender: "lead", contentType: "text", body: "c", mediaUrl: null, mediaId: null, createdAt: null },
      ],
    });
    expect(out.map(o => o.id)).toEqual(["srv-10", "srv-11", "srv-12"]);
  });
});

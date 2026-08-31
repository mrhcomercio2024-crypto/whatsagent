import { randomBytes } from "crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import { getAgentById } from "../db";
import { storagePut } from "../storage";
import {
  createPublicSimulatorSession,
  ensurePublicSimulatorConfig,
  getPublicSimulatorConfigByAgent,
  getPublicSimulatorConfigBySlug,
  getPublicSimulatorSessionAdmin,
  listPublicConversions,
  listPublicSessionMessages,
  listPublicSimulatorSessions,
  requirePublicSimulatorSession,
  updatePublicSimulatorConfig,
} from "./db";
import {
  hashIp,
  processPublicSimulatorTurn,
  safeRequestId,
  trackCheckoutClick,
} from "./service";

const sessionAuthSchema = z.object({
  publicId: z.string().min(16).max(64),
  token: z.string().min(24).max(100),
});

function publicConfig(config: Awaited<ReturnType<typeof getPublicSimulatorConfigBySlug>>) {
  if (!config) return null;
  return {
    slug: config.slug,
    displayName: config.displayName,
    statusText: config.statusText,
    avatarUrl: config.avatarUrl,
    accentColor: config.accentColor,
    welcomeMessage: config.welcomeMessage,
    startButtonText: config.startButtonText,
    startLeadMessage: config.startLeadMessage,
    inputPlaceholder: config.inputPlaceholder,
    checkoutButtonText: config.checkoutButtonText,
  };
}

function publicTiming(agent: Awaited<ReturnType<typeof getAgentById>>) {
  if (!agent) return null;
  return {
    debounceSeconds: agent.debounceSeconds,
    typingSimulationEnabled: agent.typingSimulationEnabled,
    typingCps: agent.typingCps,
    typingMinDelayMs: agent.typingMinDelayMs,
    typingMaxDelayMs: agent.typingMaxDelayMs,
    interMessageDelayMs: agent.interMessageDelayMs,
  };
}

export const publicSimulatorRouter = router({
  bootstrap: publicProcedure
    .input(
      z.object({
        slug: z.string().min(1).max(100),
        existing: sessionAuthSchema.optional(),
        metadata: z
          .object({
            utmSource: z.string().max(160).nullish(),
            utmMedium: z.string().max(160).nullish(),
            utmCampaign: z.string().max(240).nullish(),
            utmContent: z.string().max(240).nullish(),
            utmTerm: z.string().max(240).nullish(),
            gclid: z.string().max(240).nullish(),
            fbclid: z.string().max(240).nullish(),
            referrer: z.string().max(1000).nullish(),
            landingUrl: z.string().max(1500).nullish(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const config = await getPublicSimulatorConfigBySlug(input.slug);
      if (!config || !config.enabled) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Simulador indisponível" });
      }
      const agent = await getAgentById(config.agentId);
      if (!agent || agent.status !== "active") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Agente indisponível" });
      }

      if (input.existing) {
        try {
          const session = await requirePublicSimulatorSession(
            input.existing.publicId,
            input.existing.token,
          );
          if (session.configId === config.id && session.status !== "archived") {
            const history = await listPublicSessionMessages(session.conversationId);
            return {
              resumed: true as const,
              publicId: session.publicId,
              token: input.existing.token,
              status: session.status,
              config: publicConfig(config),
              timing: publicTiming(agent),
              messages: history,
            };
          }
        } catch {
          // Credencial antiga/inválida: cria uma sessão limpa abaixo.
        }
      }

      const forwarded = String(ctx.req.headers["x-forwarded-for"] || "").split(",")[0]?.trim();
      const remoteIp = forwarded || ctx.req.socket?.remoteAddress;
      const created = await createPublicSimulatorSession(config, {
        ...input.metadata,
        userAgent: String(ctx.req.headers["user-agent"] || "").slice(0, 1000) || null,
        ipHash: hashIp(remoteIp),
      });
      const history = await listPublicSessionMessages(created.session.conversationId);
      return {
        resumed: false as const,
        publicId: created.session.publicId,
        token: created.token,
        status: created.session.status,
        config: publicConfig(config),
        timing: publicTiming(agent),
        messages: history,
      };
    }),

  sendText: publicProcedure
    .input(
      sessionAuthSchema.extend({
        slug: z.string().min(1).max(100),
        requestId: z.string().min(8).max(80).optional(),
        kind: z.enum(["start", "text"]).default("text"),
        text: z.string().min(1).max(4000),
      }),
    )
    .mutation(async ({ input }) => {
      const config = await getPublicSimulatorConfigBySlug(input.slug);
      if (!config || !config.enabled) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Simulador indisponível" });
      }
      try {
        return await processPublicSimulatorTurn({
          ...input,
          requestId: safeRequestId(input.requestId),
          config,
        });
      } catch (error) {
        const message = (error as Error).message;
        if (message === "INVALID_PUBLIC_SESSION") {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida" });
        }
        if (message === "REQUEST_ALREADY_PROCESSING") {
          throw new TRPCError({ code: "CONFLICT", message: "Mensagem já está sendo processada" });
        }
        throw new TRPCError({ code: "BAD_REQUEST", message });
      }
    }),

  sendAudio: publicProcedure
    .input(
      sessionAuthSchema.extend({
        slug: z.string().min(1).max(100),
        requestId: z.string().min(8).max(80).optional(),
        audioBase64: z.string().min(8),
        mimeType: z.string().min(5).max(100),
        durationMs: z.number().int().min(0).max(30 * 60 * 1000).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const config = await getPublicSimulatorConfigBySlug(input.slug);
      if (!config || !config.enabled) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Simulador indisponível" });
      }
      try {
        return await processPublicSimulatorTurn({
          publicId: input.publicId,
          token: input.token,
          requestId: safeRequestId(input.requestId),
          kind: "audio",
          audioBase64: input.audioBase64,
          audioMimeType: input.mimeType,
          audioDurationMs: input.durationMs,
          config,
        });
      } catch (error) {
        const message = (error as Error).message;
        if (message === "INVALID_PUBLIC_SESSION") {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida" });
        }
        throw new TRPCError({ code: "BAD_REQUEST", message });
      }
    }),

  checkoutClicked: publicProcedure
    .input(sessionAuthSchema)
    .mutation(async ({ input }) => trackCheckoutClick(input)),
});

export const publicSimulatorAdminRouter = router({
  getConfig: adminProcedure
    .input(z.object({ agentId: z.number().int().positive() }))
    .query(({ input }) => ensurePublicSimulatorConfig(input.agentId)),

  updateConfig: adminProcedure
    .input(
      z.object({
        agentId: z.number().int().positive(),
        slug: z.string().regex(/^[a-z0-9-]+$/).min(2).max(100),
        enabled: z.boolean(),
        displayName: z.string().min(1).max(120),
        statusText: z.string().min(1).max(120),
        avatarUrl: z.string().max(500).nullable(),
        accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        welcomeMessage: z.string().min(10).max(4000),
        startButtonText: z.string().min(1).max(120),
        startLeadMessage: z.string().min(1).max(240),
        inputPlaceholder: z.string().min(1).max(160),
        checkoutUrl: z.string().url().max(1000).nullable(),
        checkoutButtonText: z.string().min(1).max(160),
        purchaseEventNames: z.array(z.string().min(1).max(120)).max(30),
        checkoutRequestPatterns: z.array(z.string().min(1).max(160)).max(50),
      }),
    )
    .mutation(({ input }) => {
      const { agentId, ...patch } = input;
      return updatePublicSimulatorConfig(agentId, patch);
    }),

  regenerateWebhookSecret: adminProcedure
    .input(z.object({ agentId: z.number().int().positive() }))
    .mutation(({ input }) =>
      updatePublicSimulatorConfig(input.agentId, {
        webhookSecret: randomBytes(32).toString("hex"),
      }),
    ),

  uploadAvatar: adminProcedure
    .input(
      z.object({
        agentId: z.number().int().positive(),
        base64: z.string().min(8),
        mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
      }),
    )
    .mutation(async ({ input }) => {
      const buffer = Buffer.from(input.base64.replace(/^data:[^;]+;base64,/, ""), "base64");
      if (!buffer.length || buffer.length > 5 * 1024 * 1024) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Avatar inválido ou maior que 5 MB" });
      }
      const ext = input.mimeType === "image/png" ? "png" : input.mimeType === "image/webp" ? "webp" : "jpg";
      const stored = await storagePut(
        `public-simulator/agent-${input.agentId}/avatar.${ext}`,
        buffer,
        input.mimeType,
      );
      await updatePublicSimulatorConfig(input.agentId, { avatarUrl: stored.url });
      return stored;
    }),

  listSessions: adminProcedure
    .input(z.object({ agentId: z.number().int().positive(), limit: z.number().int().min(1).max(500).default(200) }))
    .query(({ input }) => listPublicSimulatorSessions(input.agentId, input.limit)),

  sessionDetail: adminProcedure
    .input(z.object({ agentId: z.number().int().positive(), sessionId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const row = await getPublicSimulatorSessionAdmin(input.agentId, input.sessionId);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      const [history, conversions] = await Promise.all([
        listPublicSessionMessages(row.session.conversationId),
        listPublicConversions(row.session.id),
      ]);
      return { ...row, history, conversions };
    }),

  configForWebhook: adminProcedure
    .input(z.object({ agentId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const config = await getPublicSimulatorConfigByAgent(input.agentId);
      if (!config) return null;
      return { slug: config.slug, webhookSecret: config.webhookSecret };
    }),
});

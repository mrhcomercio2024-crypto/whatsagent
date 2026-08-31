import { randomBytes } from "crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { statusForAbsentPublicRequest } from "../../shared/publicRequestRecovery";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import { getAgentById } from "../db";
import { storagePut } from "../storage";
import {
  createPublicSimulatorSession,
  ensurePublicSimulatorConfig,
  getPublicSimulatorConfigByAgent,
  getPublicSimulatorConfigBySlug,
  recoverPublicRequestForSession,
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
import { getPublicVapidKey } from "./push/crypto";
import {
  getActiveSubscriptionForSession,
  markPushConsentDeclined,
  markPushConsentOffered,
  revokePushSubscription,
  savePushSubscription,
} from "./push/db";
import {
  cancelPendingRecoveryJobs,
  recordReturnAfterPush,
  scheduleRecoverySequence,
} from "./recovery/service";
import { isStrongInterest } from "./recovery/interest";
import {
  createRecoveryRule,
  getRecoveryDashboard,
  listPushSubscriptionSummary,
  listRecoveryJobs,
  listRecoveryRules,
  updateRecoveryRule,
} from "./recovery/admin";

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
    push: {
      enabled: config.pushEnabled,
      consentEnabled: config.pushConsentEnabled,
      minInteractions: config.pushConsentMinInteractions,
      interestScoreThreshold: config.pushInterestScoreThreshold,
      strongInterestScore: config.pushStrongInterestScore,
      consentMessage:
        config.pushConsentMessage ||
        "Posso te avisar aqui caso você saia da página antes de terminarmos?",
      consentButtonText: config.pushConsentButtonText,
    },
  };
}

function publicTiming(agent: Awaited<ReturnType<typeof getAgentById>>) {
  if (!agent) return null;
  return {
    // O WhatsApp real pode usar uma cadência mais lenta. No Ravi Web, a
    // latência de rede/LLM já cria uma pausa natural, então limitamos atrasos
    // artificiais sem alterar a configuração global do agente/Z-API.
    debounceSeconds: Math.min(agent.debounceSeconds, 2),
    typingSimulationEnabled: agent.typingSimulationEnabled,
    typingCps: Math.max(agent.typingCps, 16),
    typingMinDelayMs: Math.min(agent.typingMinDelayMs, 650),
    typingMaxDelayMs: Math.min(agent.typingMaxDelayMs, 3500),
    interMessageDelayMs: Math.min(agent.interMessageDelayMs, 850),
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
            pushId: z.string().max(64).nullish(),
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
            await recordReturnAfterPush(session.id, input.metadata?.pushId);
            const history = await listPublicSessionMessages(session.conversationId);
            return {
              resumed: true as const,
              publicId: session.publicId,
              token: input.existing.token,
              conversationId: session.conversationId,
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
        conversationId: created.session.conversationId,
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

  requestStatus: publicProcedure
    .input(
      sessionAuthSchema.extend({
        requestId: z.string().min(8).max(80),
        requestCreatedAt: z.number().int().positive(),
      }),
    )
    .query(async ({ input }) => {
      const session = await requirePublicSimulatorSession(input.publicId, input.token);
      const request = await recoverPublicRequestForSession(session.id, input.requestId);
      if (!request) {
        const absentStatus = statusForAbsentPublicRequest(input.requestCreatedAt);
        return {
          status: absentStatus,
          registered: false,
          response: null,
          errorMessage:
            absentStatus === "expired" ? "Requisição expirada antes de chegar ao servidor" : null,
          recoveryAttempts: 0,
          lastHttpStatus: absentStatus === "expired" ? 410 : 202,
          conversationId: session.conversationId,
        };
      }
      return {
        status: request.status,
        registered: true,
        response: request.status === "completed" ? request.response : null,
        errorMessage:
          request.status === "failed" || request.status === "expired"
            ? request.errorMessage
            : null,
        recoveryAttempts: request.recoveryAttempts,
        lastHttpStatus: request.lastHttpStatus,
        conversationId: session.conversationId,
      };
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
        if (message === "REQUEST_ALREADY_PROCESSING") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Esta mensagem já está sendo processada",
          });
        }
        throw new TRPCError({ code: "BAD_REQUEST", message });
      }
    }),

  checkoutClicked: publicProcedure
    .input(sessionAuthSchema)
    .mutation(async ({ input }) => trackCheckoutClick(input)),

  pushSupport: publicProcedure
    .input(sessionAuthSchema)
    .query(async ({ input }) => {
      const session = await requirePublicSimulatorSession(input.publicId, input.token);
      const config = await getPublicSimulatorConfigByAgent(session.agentId);
      const subscription = await getActiveSubscriptionForSession(session.id);
      const history = await listPublicSessionMessages(session.conversationId);
      const interactions = history.filter(message => message.direction === "inbound").length;
      const signals = Array.isArray(session.interestSignals) ? session.interestSignals : [];
      return {
        enabled: Boolean(config?.pushEnabled && config.pushConsentEnabled),
        vapidPublicKey: config?.pushEnabled ? getPublicVapidKey() : null,
        subscriptionActive: Boolean(subscription?.active),
        permissionStatus: subscription?.permissionStatus || null,
        consentOfferedAt: session.pushConsentOfferedAt,
        consentGrantedAt: session.pushConsentGrantedAt,
        consentDeclinedAt: session.pushConsentDeclinedAt,
        optedOutAt: session.pushOptedOutAt,
        consentEligible: Boolean(
          config?.pushEnabled &&
            config.pushConsentEnabled &&
            interactions >= config.pushConsentMinInteractions &&
            session.leadScore >= config.pushInterestScoreThreshold &&
            !session.pushConsentDeclinedAt &&
            !session.pushOptedOutAt,
        ),
        strongInterest: isStrongInterest({
          score: session.leadScore,
          strongThreshold: config?.pushStrongInterestScore ?? 65,
          signals: signals as Array<{ code: string; label: string; points: number }>,
          explicitlyRequestedAlerts: signals.some((signal: any) => signal?.code === "requested_alerts"),
        }),
        score: session.leadScore,
        signals,
      };
    }),

  pushConsentOffered: publicProcedure
    .input(sessionAuthSchema)
    .mutation(async ({ input }) => {
      const session = await requirePublicSimulatorSession(input.publicId, input.token);
      await markPushConsentOffered(session.id);
      return { ok: true };
    }),

  pushConsentDeclined: publicProcedure
    .input(sessionAuthSchema)
    .mutation(async ({ input }) => {
      const session = await requirePublicSimulatorSession(input.publicId, input.token);
      await markPushConsentDeclined(session.id);
      return { ok: true };
    }),

  pushSubscribe: publicProcedure
    .input(
      sessionAuthSchema.extend({
        subscription: z.object({
          endpoint: z.string().url().max(4000),
          expirationTime: z.number().nullable().optional(),
          keys: z.object({
            p256dh: z.string().min(20).max(500),
            auth: z.string().min(8).max(200),
          }),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const session = await requirePublicSimulatorSession(input.publicId, input.token);
      const config = await getPublicSimulatorConfigByAgent(session.agentId);
      if (!config?.pushEnabled || !getPublicVapidKey()) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Notificações indisponíveis" });
      }
      const saved = await savePushSubscription({
        session,
        subscription: input.subscription,
        userAgent: String(ctx.req.headers["user-agent"] || ""),
      });
      await scheduleRecoverySequence(session.id);
      return { ok: true, subscription: saved };
    }),

  pushUnsubscribe: publicProcedure
    .input(
      sessionAuthSchema.extend({
        endpoint: z.string().url().max(4000),
        permissionStatus: z.enum(["default", "denied"]).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const session = await requirePublicSimulatorSession(input.publicId, input.token);
      await revokePushSubscription({
        sessionId: session.id,
        endpoint: input.endpoint,
        permissionStatus: input.permissionStatus,
      });
      await cancelPendingRecoveryJobs(session.id, "lead_opted_out");
      return { ok: true };
    }),

  presence: publicProcedure
    .input(sessionAuthSchema)
    .mutation(async ({ input }) => {
      await requirePublicSimulatorSession(input.publicId, input.token);
      return { ok: true, at: Date.now() };
    }),
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
        pushEnabled: z.boolean(),
        pushConsentEnabled: z.boolean(),
        pushConsentMinInteractions: z.number().int().min(1).max(50),
        pushInterestScoreThreshold: z.number().int().min(0).max(100),
        pushStrongInterestScore: z.number().int().min(0).max(100),
        pushConsentMessage: z.string().min(10).max(500),
        pushConsentButtonText: z.string().min(1).max(120),
        pushGlobalCooldownMinutes: z.number().int().min(1).max(10080),
        pushMaxPerSequence: z.number().int().min(1).max(20),
        pushAttributionWindowHours: z.number().int().min(1).max(2160),
        pushAiPersonalizationEnabled: z.boolean(),
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

  recoveryRules: adminProcedure
    .input(z.object({ agentId: z.number().int().positive() }))
    .query(({ input }) => listRecoveryRules(input.agentId)),

  createRecoveryRule: adminProcedure
    .input(z.object({
      agentId: z.number().int().positive(),
      configId: z.number().int().positive(),
      name: z.string().min(2).max(160),
      channel: z.enum(["push", "email", "instagram", "whatsapp"]),
      sequenceOrder: z.number().int().min(1).max(100),
      delayMinutes: z.number().int().min(1).max(525600),
      minLeadScore: z.number().int().min(0).max(100),
      eligibleTemperatures: z.array(z.enum(["unknown", "cold", "warm", "hot"])),
      requireInterest: z.boolean(),
      messageTemplate: z.string().min(10).max(1000),
      aiPersonalizationEnabled: z.boolean(),
      aiPrompt: z.string().max(2000).nullable(),
      attributionWindowHours: z.number().int().min(1).max(2160),
      maxAttempts: z.number().int().min(1).max(10),
      isActive: z.boolean(),
    }))
    .mutation(({ input }) => createRecoveryRule({ ...input, triggerType: "user_inactive" })),

  updateRecoveryRule: adminProcedure
    .input(z.object({
      agentId: z.number().int().positive(),
      id: z.number().int().positive(),
      patch: z.object({
        name: z.string().min(2).max(160).optional(),
        channel: z.enum(["push", "email", "instagram", "whatsapp"]).optional(),
        sequenceOrder: z.number().int().min(1).max(100).optional(),
        delayMinutes: z.number().int().min(1).max(525600).optional(),
        minLeadScore: z.number().int().min(0).max(100).optional(),
        eligibleTemperatures: z.array(z.enum(["unknown", "cold", "warm", "hot"])).optional(),
        requireInterest: z.boolean().optional(),
        messageTemplate: z.string().min(10).max(1000).optional(),
        aiPersonalizationEnabled: z.boolean().optional(),
        aiPrompt: z.string().max(2000).nullable().optional(),
        attributionWindowHours: z.number().int().min(1).max(2160).optional(),
        maxAttempts: z.number().int().min(1).max(10).optional(),
        isActive: z.boolean().optional(),
      }),
    }))
    .mutation(({ input }) => updateRecoveryRule(input.agentId, input.id, input.patch)),

  recoveryJobs: adminProcedure
    .input(z.object({ agentId: z.number().int().positive(), limit: z.number().int().min(1).max(500).default(200) }))
    .query(({ input }) => listRecoveryJobs(input.agentId, input.limit)),

  pushSubscriptions: adminProcedure
    .input(z.object({ agentId: z.number().int().positive(), limit: z.number().int().min(1).max(500).default(200) }))
    .query(({ input }) => listPushSubscriptionSummary(input.agentId, input.limit)),

  recoveryDashboard: adminProcedure
    .input(z.object({ agentId: z.number().int().positive() }))
    .query(({ input }) => getRecoveryDashboard(input.agentId)),
});

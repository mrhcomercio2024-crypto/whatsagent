import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  appendMessage,
  cancelPendingJobsForConversation,
  createAgent,
  createFollowupRule,
  createHandoffKeyword,
  createKnowledge,
  createMedia,
  updateMedia,
  createStep,
  createTemplate,
  createTrigger,
  deleteAgent,
  deleteFollowupRule,
  deleteHandoffKeyword,
  deleteKnowledge,
  deleteMedia,
  deleteStep,
  deleteTemplate,
  deleteTrigger,
  findOrCreateConversation,
  findOrCreateLead,
  getAgentById,
  getMediaById,
  getBrainByAgent,
  getBusinessHours,
  getConversationById,
  getLeadById,
  getLeadHistory,
  getMetricsSummary,
  getWhatsappConfig,
  listAgents,
  listConversationsWithLeads,
  listFollowupJobs,
  listFollowupRules,
  listHandoffKeywords,
  listKnowledge,
  listLeads,
  listMedia,
  listMessages,
  listSteps,
  listTemplates,
  listTriggers,
  recordMetric,
  scheduleFollowupJobs,
  updateAgent,
  updateConversation,
  updateFollowupRule,
  updateLead,
  updateStep,
  updateTrigger,
  upsertBrain,
  upsertBusinessHours,
  upsertWhatsappConfig,
  getQrSession,
  listLlmPrices,
  upsertLlmPrice,
  seedLlmPricesIfEmpty,
  getCostsSummary,
  getCostsByLead,
  listCostExtras,
  addCostExtra,
  deleteCostExtra,
  listRestrictedTerms,
  addRestrictedTerm,
  listLeadStatusRules,
  createLeadStatusRule,
  updateLeadStatusRule,
  deleteLeadStatusRule,
  deleteRestrictedTerm,
  updateStepLiteralMode,
} from "./db";
import {
  startQrSession,
  disconnectQrSession,
  isAgentConnected,
  getAgentRuntimeStats,
} from "./whatsapp/baileys";
import { storagePut } from "./storage";
import { processInboundForReply } from "./ai/orchestrator";
import { dispatchActions } from "./whatsapp/dispatcher";
import { qualifyLead } from "./ai/qualifier";
import { AVAILABLE_LLM_MODELS } from "../shared/llm-models";
import { REFERENCE_PRICES } from "./ai/pricing";

const idSchema = z.object({ id: z.number().int().positive() });
const agentScopedSchema = z.object({ agentId: z.number().int().positive() });

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Catálogo ───
  catalog: router({
    llmModels: publicProcedure.query(() => AVAILABLE_LLM_MODELS),
  }),

  // ─── AGENTS ───
  agents: router({
    list: protectedProcedure.query(() => listAgents()),
    get: protectedProcedure.input(idSchema).query(({ input }) => getAgentById(input.id)),
    create: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1),
          description: z.string().optional(),
          persona: z.string().optional(),
          defaultLlmModel: z.string().default("gpt-4.1"),
          status: z.enum(["draft", "active", "paused"]).default("draft"),
          language: z.string().default("pt-BR"),
          connectionMode: z.enum(["official", "qr"]).default("official"),
        })
      )
      .mutation(({ input }) => createAgent(input)),
    update: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          patch: z.object({
            name: z.string().min(1).optional(),
            description: z.string().nullable().optional(),
            persona: z.string().nullable().optional(),
            defaultLlmModel: z.string().optional(),
            status: z.enum(["draft", "active", "paused"]).optional(),
            language: z.string().optional(),
            connectionMode: z.enum(["official", "qr"]).optional(),
          }),
        })
      )
      .mutation(({ input }) => updateAgent(input.id, input.patch)),
    delete: protectedProcedure.input(idSchema).mutation(({ input }) => deleteAgent(input.id)),
    updateBehavior: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          patch: z.object({
            debounceSeconds: z.number().int().min(0).max(300).optional(),
            typingSimulationEnabled: z.boolean().optional(),
            typingCps: z.number().int().min(5).max(80).optional(),
            typingMinDelayMs: z.number().int().min(0).max(60_000).optional(),
            typingMaxDelayMs: z.number().int().min(0).max(120_000).optional(),
            interMessageDelayMs: z.number().int().min(0).max(60_000).optional(),
            splitLongMessages: z.boolean().optional(),
            splitMaxChars: z.number().int().min(80).max(600).optional(),
          }),
        })
      )
      .mutation(({ input }) => updateAgent(input.id, input.patch)),
    updateSummaryConfig: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          patch: z.object({
            // a cada N mensagens, o resumidor evolutivo é acionado
            summaryEveryN: z.number().int().min(3).max(30).optional(),
            // null = usa o defaultLlmModel do agente; quando string, precisa ser um modelo conhecido
            summaryLlmModel: z
              .string()
              .min(1)
              .max(80)
              .refine(v => AVAILABLE_LLM_MODELS.some(m => m.id === v), {
                message: "Modelo de LLM desconhecido",
              })
              .nullable()
              .optional(),
          }),
        })
      )
      .mutation(({ input }) => updateAgent(input.id, input.patch)),
  }),

  // ─── BRAIN ───
  brain: router({
    get: protectedProcedure.input(agentScopedSchema).query(({ input }) =>
      getBrainByAgent(input.agentId)
    ),
    save: protectedProcedure
      .input(
        z.object({
          agentId: z.number().int().positive(),
          masterPrompt: z.string().min(1),
          tone: z.string().nullable().optional(),
          rules: z.string().nullable().optional(),
          products: z.string().nullable().optional(),
          objections: z.string().nullable().optional(),
          companyInfo: z.string().nullable().optional(),
        })
      )
      .mutation(({ input }) => upsertBrain(input)),
  }),

  // ─── STEPS ───
  steps: router({
    list: protectedProcedure.input(agentScopedSchema).query(({ input }) =>
      listSteps(input.agentId)
    ),
    create: protectedProcedure
      .input(
        z.object({
          agentId: z.number().int().positive(),
          name: z.string().min(1),
          orderIndex: z.number().int(),
          instructions: z.string().min(1),
          completionCriteria: z.string().nullable().optional(),
          llmModel: z.string().nullable().optional(),
          isMandatory: z.boolean().default(true),
          maxMessages: z.number().int().min(1).max(50).nullable().optional(),
        })
      )
      .mutation(({ input }) => createStep(input)),
    update: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          patch: z.object({
            name: z.string().optional(),
            orderIndex: z.number().int().optional(),
            instructions: z.string().optional(),
            completionCriteria: z.string().nullable().optional(),
            llmModel: z.string().nullable().optional(),
            isMandatory: z.boolean().optional(),
            literalMode: z.boolean().optional(),
            literalText: z.string().nullable().optional(),
            // null/0 = sem limite; 1..50 = avança automaticamente após N mensagens da IA na etapa
            maxMessages: z.number().int().min(1).max(50).nullable().optional(),
          }),
        })
      )
      .mutation(({ input }) => updateStep(input.id, input.patch as any)),
    setLiteralMode: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          literalMode: z.boolean(),
          literalText: z.string().nullable(),
        })
      )
      .mutation(({ input }) =>
        updateStepLiteralMode(input.id, input.literalMode, input.literalText)
      ),
    delete: protectedProcedure.input(idSchema).mutation(({ input }) => deleteStep(input.id)),
    reorder: protectedProcedure
      .input(
        z.object({
          ids: z.array(z.number().int().positive()),
        })
      )
      .mutation(async ({ input }) => {
        for (let i = 0; i < input.ids.length; i++) {
          await updateStep(input.ids[i], { orderIndex: i });
        }
      }),
  }),

  // ─── KNOWLEDGE BASE ───
  knowledge: router({
    list: protectedProcedure.input(agentScopedSchema).query(({ input }) =>
      listKnowledge(input.agentId)
    ),
    create: protectedProcedure
      .input(
        z.object({
          agentId: z.number().int().positive(),
          title: z.string().min(1),
          content: z.string().min(1),
          tags: z.string().nullable().optional(),
        })
      )
      .mutation(({ input }) => createKnowledge(input)),
    update: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          patch: z.object({
            title: z.string().optional(),
            content: z.string().optional(),
            tags: z.string().nullable().optional(),
          }),
        })
      )
      .mutation(async ({ input }) => {
        const { updateKnowledge } = await import("./db");
        return updateKnowledge(input.id, input.patch);
      }),
    delete: protectedProcedure.input(idSchema).mutation(({ input }) => deleteKnowledge(input.id)),
  }),

  // ─── MEDIA ───
  media: router({
    list: protectedProcedure.input(agentScopedSchema).query(({ input }) =>
      listMedia(input.agentId)
    ),
    upload: protectedProcedure
      .input(
        z.object({
          agentId: z.number().int().positive(),
          name: z.string().min(1),
          description: z.string().nullable().optional(),
          mediaType: z.enum(["image", "video", "document", "audio"]),
          base64: z.string().min(1),
          mimeType: z.string().min(1),
          caption: z.string().nullable().optional(),
          purpose: z.string().nullable().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const buffer = Buffer.from(input.base64, "base64");
        const ext = (input.mimeType.split("/")[1] || "bin").split(";")[0];
        const key = `agent-${input.agentId}/media/${Date.now()}.${ext}`;
        const stored = await storagePut(key, buffer, input.mimeType);
        return createMedia({
          agentId: input.agentId,
          name: input.name,
          description: input.description ?? null,
          mediaType: input.mediaType,
          storageKey: stored.key,
          storageUrl: stored.url,
          mimeType: input.mimeType,
          caption: input.caption ?? null,
          purpose: input.purpose ?? "outro",
        });
      }),
    update: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          patch: z.object({
            name: z.string().min(1).optional(),
            description: z.string().nullable().optional(),
            caption: z.string().nullable().optional(),
            purpose: z.string().nullable().optional(),
          }),
        })
      )
      .mutation(({ input }) => updateMedia(input.id, input.patch)),
    delete: protectedProcedure.input(idSchema).mutation(({ input }) => deleteMedia(input.id)),

    listTriggers: protectedProcedure
      .input(agentScopedSchema)
      .query(({ input }) => listTriggers(input.agentId)),
    createTrigger: protectedProcedure
      .input(
        z.object({
          agentId: z.number().int().positive(),
          mediaId: z.number().int().positive(),
          triggerType: z.enum(["keyword", "step", "ai_decision", "intent"]),
          keywords: z.string().nullable().optional(),
          stepId: z.number().int().nullable().optional(),
          intentLabel: z.string().nullable().optional(),
          intentDescription: z.string().nullable().optional(),
          sendOncePerConversation: z.boolean().default(true),
          isActive: z.boolean().default(true),
        })
      )
      .mutation(({ input }) => createTrigger(input)),
    updateTrigger: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          patch: z.object({
            triggerType: z.enum(["keyword", "step", "ai_decision", "intent"]).optional(),
            keywords: z.string().nullable().optional(),
            stepId: z.number().int().nullable().optional(),
            intentLabel: z.string().nullable().optional(),
            intentDescription: z.string().nullable().optional(),
            sendOncePerConversation: z.boolean().optional(),
            isActive: z.boolean().optional(),
          }),
        })
      )
      .mutation(({ input }) => updateTrigger(input.id, input.patch)),
    deleteTrigger: protectedProcedure
      .input(idSchema)
      .mutation(({ input }) => deleteTrigger(input.id)),
  }),

  // ─── WHATSAPP ───
  whatsapp: router({
    getConfig: protectedProcedure
      .input(agentScopedSchema)
      .query(({ input }) => getWhatsappConfig(input.agentId)),
    saveConfig: protectedProcedure
      .input(
        z.object({
          agentId: z.number().int().positive(),
          phoneNumberId: z.string().nullable().optional(),
          businessAccountId: z.string().nullable().optional(),
          accessToken: z.string().nullable().optional(),
          verifyToken: z.string().nullable().optional(),
          appSecret: z.string().nullable().optional(),
          displayPhoneNumber: z.string().nullable().optional(),
          isConnected: z.boolean().optional(),
        })
      )
      .mutation(({ input }) => upsertWhatsappConfig(input)),
    listTemplates: protectedProcedure
      .input(agentScopedSchema)
      .query(({ input }) => listTemplates(input.agentId)),
    createTemplate: protectedProcedure
      .input(
        z.object({
          agentId: z.number().int().positive(),
          name: z.string().min(1),
          languageCode: z.string().default("pt_BR"),
          category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]),
          bodyText: z.string().min(1),
          variables: z.array(z.string()).default([]),
          status: z.enum(["approved", "pending", "rejected"]).default("approved"),
        })
      )
      .mutation(({ input }) => createTemplate(input)),
    deleteTemplate: protectedProcedure
      .input(idSchema)
      .mutation(({ input }) => deleteTemplate(input.id)),
  }),

  // ─── QR (Baileys, modo não oficial) ───
  qr: router({
    status: protectedProcedure
      .input(agentScopedSchema)
      .query(async ({ input }) => {
        const s = await getQrSession(input.agentId);
        return {
          status: s?.status ?? "disconnected",
          lastQr: s?.lastQr ?? null,
          jid: s?.jid ?? null,
          displayName: s?.displayName ?? null,
          lastConnectedAt: s?.lastConnectedAt ?? null,
          lastError: s?.lastError ?? null,
          live: isAgentConnected(input.agentId),
        };
      }),
    start: protectedProcedure
      .input(agentScopedSchema)
      .mutation(async ({ input }) => {
        await startQrSession(input.agentId);
        return { ok: true };
      }),
    disconnect: protectedProcedure
      .input(
        z.object({
          agentId: z.number().int().positive(),
          wipe: z.boolean().default(false),
        })
      )
      .mutation(async ({ input }) => {
        await disconnectQrSession(input.agentId, input.wipe);
        return { ok: true };
      }),
    /**
     * Saúde do bridge Baileys: estatísticas em memória (uptime, mensagens/min,
     * tentativas de reconnect, rate limit). Atualiza em tempo real.
     */
    health: protectedProcedure
      .input(agentScopedSchema)
      .query(({ input }) => getAgentRuntimeStats(input.agentId)),
  }),

  // ─── BUSINESS HOURS / HANDOFF ───
  ops: router({
    getBusinessHours: protectedProcedure
      .input(agentScopedSchema)
      .query(({ input }) => getBusinessHours(input.agentId)),
    saveBusinessHours: protectedProcedure
      .input(
        z.object({
          agentId: z.number().int().positive(),
          enabled: z.boolean(),
          timezone: z.string().default("America/Sao_Paulo"),
          weekly: z.record(
            z.string(),
            z.object({
              start: z.string(),
              end: z.string(),
              closed: z.boolean().optional(),
            })
          ),
          outOfHoursMessage: z.string().nullable().optional(),
        })
      )
      .mutation(({ input }) => upsertBusinessHours(input)),

    listHandoffKeywords: protectedProcedure
      .input(agentScopedSchema)
      .query(({ input }) => listHandoffKeywords(input.agentId)),
    createHandoffKeyword: protectedProcedure
      .input(
        z.object({
          agentId: z.number().int().positive(),
          keyword: z.string().min(1),
          notifyMessage: z.string().nullable().optional(),
        })
      )
      .mutation(({ input }) => createHandoffKeyword(input)),
    deleteHandoffKeyword: protectedProcedure
      .input(idSchema)
      .mutation(({ input }) => deleteHandoffKeyword(input.id)),
  }),

  // ─── FOLLOWUP ───
  followup: router({
    listRules: protectedProcedure
      .input(agentScopedSchema)
      .query(({ input }) => listFollowupRules(input.agentId)),
    createRule: protectedProcedure
      .input(
        z.object({
          agentId: z.number().int().positive(),
          name: z.string().min(1),
          orderIndex: z.number().int(),
          delayMinutes: z.number().int().min(1),
          messageMode: z.enum(["ai_generated", "fixed_text", "template"]),
          fixedText: z.string().nullable().optional(),
          aiInstruction: z.string().nullable().optional(),
          templateId: z.number().int().nullable().optional(),
          templateVariables: z.array(z.string()).default([]),
          windowPolicy: z.enum(["auto", "force_template", "force_free"]).default("auto"),
          cancelOnReply: z.boolean().default(true),
          allowedStartHour: z.number().int().min(0).max(23).nullable().optional(),
          allowedEndHour: z.number().int().min(0).max(23).nullable().optional(),
          isActive: z.boolean().default(true),
        })
      )
      .mutation(({ input }) => createFollowupRule(input)),
    updateRule: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          patch: z.object({
            name: z.string().optional(),
            orderIndex: z.number().int().optional(),
            delayMinutes: z.number().int().min(1).optional(),
            messageMode: z.enum(["ai_generated", "fixed_text", "template"]).optional(),
            fixedText: z.string().nullable().optional(),
            aiInstruction: z.string().nullable().optional(),
            templateId: z.number().int().nullable().optional(),
            templateVariables: z.array(z.string()).optional(),
            windowPolicy: z.enum(["auto", "force_template", "force_free"]).optional(),
            cancelOnReply: z.boolean().optional(),
            allowedStartHour: z.number().int().min(0).max(23).nullable().optional(),
            allowedEndHour: z.number().int().min(0).max(23).nullable().optional(),
            isActive: z.boolean().optional(),
          }),
        })
      )
      .mutation(({ input }) => updateFollowupRule(input.id, input.patch)),
    deleteRule: protectedProcedure
      .input(idSchema)
      .mutation(({ input }) => deleteFollowupRule(input.id)),
    listJobs: protectedProcedure
      .input(agentScopedSchema)
      .query(({ input }) => listFollowupJobs(input.agentId)),
  }),

  // ─── CONVERSATIONS / INBOX ───
  conversations: router({
    list: protectedProcedure
      .input(agentScopedSchema)
      .query(({ input }) => listConversationsWithLeads(input.agentId)),
    get: protectedProcedure.input(idSchema).query(async ({ input }) => {
      const conv = await getConversationById(input.id);
      if (!conv) return null;
      const lead = await getLeadById(conv.leadId);
      const msgs = await listMessages(input.id);
      return { conversation: conv, lead, messages: msgs };
    }),
    setPause: protectedProcedure
      .input(z.object({ id: z.number().int().positive(), aiPaused: z.boolean() }))
      .mutation(async ({ input }) =>
        updateConversation(input.id, {
          aiPaused: input.aiPaused,
          status: input.aiPaused ? "human_handoff" : "open",
        })
      ),
    setStatus: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          status: z.enum(["open", "human_handoff", "closed", "archived"]),
        })
      )
      .mutation(({ input }) => updateConversation(input.id, { status: input.status })),
    sendHumanMessage: protectedProcedure
      .input(
        z.object({
          conversationId: z.number().int().positive(),
          text: z.string().min(1),
        })
      )
      .mutation(async ({ input }) => {
        const conv = await getConversationById(input.conversationId);
        if (!conv) throw new TRPCError({ code: "NOT_FOUND" });
        const agent = await getAgentById(conv.agentId);
        if (!agent) throw new TRPCError({ code: "NOT_FOUND" });
        // Comando interno do operador: zera a conversa sem enviar nada ao lead.
        const { isResetCommand } = await import("./ai/resetCommand");
        if (isResetCommand(input.text)) {
          const { resetConversation } = await import("./db");
          await resetConversation(conv.id);
          return { reset: true } as const;
        }
        await dispatchActions({
          agent,
          conversationId: conv.id,
          actions: [{ type: "text", text: input.text }],
          sender: "human",
        });
        return { reset: false } as const;
      }),
  }),

  // ─── LEADS ───
  leads: router({
    list: protectedProcedure
      .input(agentScopedSchema)
      .query(({ input }) => listLeads(input.agentId)),
    update: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          patch: z.object({
            name: z.string().nullable().optional(),
            email: z.string().nullable().optional(),
            temperature: z.enum(["hot", "warm", "cold", "unknown"]).optional(),
            qualificationNotes: z.string().nullable().optional(),
            tags: z.string().nullable().optional(),
          }),
        })
      )
      .mutation(({ input }) => updateLead(input.id, input.patch)),
    qualify: protectedProcedure
      .input(z.object({ leadId: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const lead = await getLeadById(input.leadId);
        if (!lead) throw new TRPCError({ code: "NOT_FOUND" });
        // pega última conversa
        const convs = await listConversationsWithLeads(lead.agentId);
        const c = convs.find(c => c.lead.id === lead.id);
        if (!c) return { temperature: "unknown" as const, reason: "Sem conversa" };
        const msgs = await listMessages(c.conv.id, { limit: 30 });
        const transcript = msgs.map(m => ({
          role: (m.direction === "inbound" ? "user" : "assistant") as "user" | "assistant",
          text: m.body || "",
        }));
        const q = await qualifyLead({ history: transcript });
        await updateLead(lead.id, {
          temperature: q.temperature,
          qualificationNotes: q.reason,
        });
        return q;
      }),
    history: protectedProcedure
      .input(z.object({ leadId: z.number().int().positive(), limit: z.number().int().min(1).max(500).optional() }))
      .query(async ({ input }) => {
        const events = await getLeadHistory(input.leadId, input.limit ?? 200);
        return events;
      }),
    exportCsv: protectedProcedure
      .input(agentScopedSchema)
      .query(async ({ input }) => {
        const leads = await listLeads(input.agentId);
        const header = "id,phoneNumber,name,email,temperature,tags,createdAt";
        const rows = leads.map(l =>
          [
            l.id,
            csvEscape(l.phoneNumber),
            csvEscape(l.name ?? ""),
            csvEscape(l.email ?? ""),
            l.temperature,
            csvEscape(l.tags ?? ""),
            l.createdAt.toISOString(),
          ].join(",")
        );
        return [header, ...rows].join("\n");
      }),
  }),

  // ─── METRICS ───
  metrics: router({
    summary: protectedProcedure
      .input(z.object({ agentId: z.number().int().positive(), daysBack: z.number().int().default(30) }))
      .query(({ input }) => getMetricsSummary(input.agentId, input.daysBack)),
  }),

  // ─── SIMULATOR ───
  simulator: router({
    sendMessage: protectedProcedure
      .input(
        z.object({
          agentId: z.number().int().positive(),
          conversationId: z.number().int().positive().nullable().optional(),
          text: z.string().min(1),
          simulatedPhone: z.string().default("+55SIMULATED"),
        })
      )
      .mutation(async ({ input }) => {
        const agent = await getAgentById(input.agentId);
        if (!agent) throw new TRPCError({ code: "NOT_FOUND" });
        let convId = input.conversationId ?? null;
        if (!convId) {
          const leadId = await findOrCreateLead(
            agent.id,
            input.simulatedPhone,
            "Simulador"
          );
          convId = await findOrCreateConversation(agent.id, leadId);
        }
        await appendMessage({
          conversationId: convId,
          direction: "inbound",
          sender: "lead",
          contentType: "text",
          body: input.text,
        });
        await recordMetric({
          agentId: agent.id,
          conversationId: convId,
          eventType: "message_received",
        });
        const result = await processInboundForReply({
          agent,
          conversationId: convId,
          inboundText: input.text,
          isSimulation: true,
        });
        // Quebra textos longos em vários balões se o agente tiver isso ativado
        const { splitMessage } = await import("./ai/splitter");
        type SimAction =
          | { type: "text"; text: string }
          | { type: "media"; mediaId: number };
        const expanded: SimAction[] = result.actions.flatMap<SimAction>((a) =>
          a.type === "text"
            ? splitMessage(a.text, {
                enabled: agent.splitLongMessages,
                maxChars: agent.splitMaxChars,
              }).map((piece) => ({ type: "text" as const, text: piece }))
            : [a],
        );
        // Enriquecer ações com timing e dados visuais para o emulador
        const { computeTypingDelayMs } = await import("./ai/humanize");
        const enriched = await Promise.all(
          expanded.map(async a => {
            if (a.type === "text") {
              const typingMs = computeTypingDelayMs(a.text.length, agent);
              await appendMessage({
                conversationId: convId!,
                direction: "outbound",
                sender: "ai",
                contentType: "text",
                body: a.text,
              });
              return {
                kind: "text" as const,
                text: a.text,
                typingMs,
              };
            }
            const m = await getMediaById(a.mediaId);
            const fakeLen = (m?.caption?.length ?? 0) + 60;
            const typingMs = computeTypingDelayMs(fakeLen, agent);
            await appendMessage({
              conversationId: convId!,
              direction: "outbound",
              sender: "ai",
              contentType: (m?.mediaType ?? "image") as any,
              body: m?.caption ?? null,
              mediaUrl: m?.storageUrl ?? null,
              mediaId: a.mediaId,
            });
            return {
              kind: "media" as const,
              mediaId: a.mediaId,
              mediaType: (m?.mediaType ?? "image") as "image" | "video" | "audio" | "document",
              mediaUrl: m?.storageUrl ?? null,
              caption: m?.caption ?? null,
              filename: m?.name ?? null,
              typingMs,
            };
          })
        );
        return {
          conversationId: convId,
          handoff: result.handoff,
          stepAdvanced: result.stepAdvanced,
          outOfHours: result.outOfHours,
          actions: enriched,
          timing: {
            debounceSeconds: agent.debounceSeconds,
            typingSimulationEnabled: agent.typingSimulationEnabled,
            typingCps: agent.typingCps,
            typingMinDelayMs: agent.typingMinDelayMs,
            typingMaxDelayMs: agent.typingMaxDelayMs,
            interMessageDelayMs: agent.interMessageDelayMs,
          },
        };
      }),
    reset: protectedProcedure
      .input(z.object({ conversationId: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        // Usa o reset completo: apaga mensagens, zera summary/etapa,
        // cancela follow-ups e volta currentStepId para a etapa 1.
        const { resetConversation } = await import("./db");
        await resetConversation(input.conversationId);
      }),
    /**
     * Histórico persistente do simulador. Se a conversa do número
     * `+55SIMULATED` já existir, devolve as mensagens. Caso contrário,
     * devolve `{ conversationId: null, messages: [] }`. **Não cria** a
     * conversa — isso só acontece quando o usuário envia a 1ª mensagem.
     */
    history: protectedProcedure
      .input(
        z.object({
          agentId: z.number().int().positive(),
          simulatedPhone: z.string().default("+55SIMULATED"),
        })
      )
      .query(async ({ input }) => {
        const { findLeadByPhone, findConversationByLead, listMessages } =
          await import("./db");
        const lead = await findLeadByPhone(input.agentId, input.simulatedPhone);
        if (!lead) return { conversationId: null, messages: [] };
        const conv = await findConversationByLead(lead.id);
        if (!conv) return { conversationId: null, messages: [] };
        const msgs = await listMessages(conv.id, { limit: 200 });
        return {
          conversationId: conv.id,
          messages: msgs.map(m => ({
            id: m.id,
            direction: m.direction as "inbound" | "outbound",
            sender: m.sender as "lead" | "ai" | "human" | string,
            contentType: m.contentType as string,
            body: m.body,
            mediaUrl: (m as any).mediaUrl ?? null,
            mediaId: (m as any).mediaId ?? null,
            createdAt:
              m.createdAt instanceof Date
                ? m.createdAt.toISOString()
                : (m.createdAt as any),
          })),
        };
      }),
  }),

  // ============================================================
  // CUSTOS
  // ============================================================
  costs: router({
    summary: protectedProcedure
      .input(z.object({
        agentId: z.number().int().positive().optional(),
        daysBack: z.number().int().min(1).max(365).default(30),
        model: z.string().min(1).max(120).optional(),
      }))
      .query(async ({ input }) => getCostsSummary(input)),

    byLead: protectedProcedure
      .input(z.object({
        agentId: z.number().int().positive().optional(),
        daysBack: z.number().int().min(1).max(365).default(30),
        limit: z.number().int().min(1).max(500).default(100),
        offset: z.number().int().min(0).default(0),
        model: z.string().min(1).max(120).optional(),
      }))
      .query(async ({ input }) => getCostsByLead(input)),

    prices: router({
      list: protectedProcedure.query(async () => {
        // Garante seed das tabelas de referência na primeira leitura
        await seedLlmPricesIfEmpty(REFERENCE_PRICES);
        return await listLlmPrices();
      }),
      upsert: protectedProcedure
        .input(z.object({
          model: z.string().min(1).max(120),
          inputPer1M: z.number().int().nonnegative(),
          outputPer1M: z.number().int().nonnegative(),
          notes: z.string().max(250).optional(),
        }))
        .mutation(async ({ input }) => {
          await upsertLlmPrice(input);
          return { ok: true } as const;
        }),
      reseed: protectedProcedure.mutation(async () => {
        // Reset rápido: insere o que faltar (não sobrescreve preferida do usuário)
        for (const p of REFERENCE_PRICES) await upsertLlmPrice(p);
        return { ok: true } as const;
      }),
    }),

    extras: router({
      list: protectedProcedure
        .input(z.object({ agentId: z.number().int().positive().optional() }))
        .query(async ({ input }) => listCostExtras(input)),
      add: protectedProcedure
        .input(z.object({
          agentId: z.number().int().positive().optional(),
          label: z.string().min(1).max(200),
          amountMicroUsd: z.number().int().nonnegative(),
          period: z.enum(["one_time", "monthly"]).default("monthly"),
          notes: z.string().max(300).optional(),
        }))
        .mutation(async ({ input }) => {
          await addCostExtra({ ...input, occurredOn: new Date() });
          return { ok: true } as const;
        }),
      remove: protectedProcedure
        .input(idSchema)
        .mutation(async ({ input }) => {
          await deleteCostExtra(input.id);
          return { ok: true } as const;
        }),
    }),
  }),

  // ─── RESTRICTED TERMS ───
  restrictedTerms: router({
    list: protectedProcedure
      .input(agentScopedSchema)
      .query(({ input }) => listRestrictedTerms(input.agentId)),
    add: protectedProcedure
      .input(
        z.object({
          agentId: z.number().int().positive(),
          term: z.string().min(1).max(200),
          action: z.enum(["block", "rewrite"]).default("block"),
          notes: z.string().max(300).nullable().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await addRestrictedTerm(input);
        return { ok: true } as const;
      }),
    remove: protectedProcedure
      .input(z.object({ id: z.number().int().positive(), agentId: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        await deleteRestrictedTerm(input.id, input.agentId);
        return { ok: true } as const;
      }),
  }),

  // ─── LEAD STATUS RULES (tags automáticas) ───
  leadStatusRules: router({
    list: protectedProcedure
      .input(agentScopedSchema)
      .query(({ input }) => listLeadStatusRules(input.agentId)),
    create: protectedProcedure
      .input(
        z.object({
          agentId: z.number().int().positive(),
          slug: z.string().min(2).max(80).regex(/^[a-z][a-z0-9_]*$/, {
            message: "Slug deve começar com letra minúscula e conter apenas [a-z0-9_]",
          }),
          label: z.string().min(1).max(120),
          description: z.string().min(10).max(2000),
          isBlocking: z.boolean().default(true),
          replyWhenBlocked: z.string().max(2000).nullable().optional(),
          handoffOnMatch: z.boolean().default(true),
          notifyOwnerOnMatch: z.boolean().default(true),
          badgeColor: z.enum(["amber", "red", "blue", "green", "purple", "slate"]).default("amber"),
          isActive: z.boolean().default(true),
        })
      )
      .mutation(async ({ input }) => {
        const id = await createLeadStatusRule(input);
        return { id, ok: true } as const;
      }),
    update: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          agentId: z.number().int().positive(),
          patch: z.object({
            label: z.string().min(1).max(120).optional(),
            description: z.string().min(10).max(2000).optional(),
            isBlocking: z.boolean().optional(),
            replyWhenBlocked: z.string().max(2000).nullable().optional(),
            handoffOnMatch: z.boolean().optional(),
            notifyOwnerOnMatch: z.boolean().optional(),
            badgeColor: z.enum(["amber", "red", "blue", "green", "purple", "slate"]).optional(),
            isActive: z.boolean().optional(),
          }),
        })
      )
      .mutation(async ({ input }) => {
        await updateLeadStatusRule(input.id, input.agentId, input.patch);
        return { ok: true } as const;
      }),
    remove: protectedProcedure
      .input(z.object({ id: z.number().int().positive(), agentId: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        await deleteLeadStatusRule(input.id, input.agentId);
        return { ok: true } as const;
      }),
    // Remove manualmente a tag do lead (para reabrir o fluxo)
    clearLeadTag: protectedProcedure
      .input(z.object({ leadId: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const { updateLead } = await import("./db");
        await updateLead(input.leadId, { statusTag: null, statusTagSetAt: null });
        return { ok: true } as const;
      }),
  }),

  // ============================================================
  // EXTERNAL EVENTS — fontes, regras e log de eventos recebidos
  // ============================================================
  externalEvents: router({
    // ---- SOURCES ----
    listSources: protectedProcedure
      .input(agentScopedSchema)
      .query(async ({ input }) => {
        const { getDb } = await import("./db");
        const { externalEventSources } = await import("../drizzle/schema");
        const { eq, desc } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) return [];
        return db
          .select()
          .from(externalEventSources)
          .where(eq(externalEventSources.agentId, input.agentId))
          .orderBy(desc(externalEventSources.createdAt));
      }),
    createSource: protectedProcedure
      .input(
        z.object({
          agentId: z.number().int().positive(),
          name: z.string().min(2).max(120),
          slug: z
            .string()
            .min(3)
            .max(80)
            .regex(/^[a-z0-9][a-z0-9-]*$/, {
              message: "Slug deve usar apenas letras minúsculas, números e hífen",
            }),
          platform: z.string().max(60).default("custom"),
          notes: z.string().max(2000).nullable().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { getDb } = await import("./db");
        const { externalEventSources } = await import("../drizzle/schema");
        const { generateSecret } = await import("./external/hmac");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        try {
          const r: any = await db.insert(externalEventSources).values({
            agentId: input.agentId,
            name: input.name,
            slug: input.slug,
            secret: generateSecret(),
            platform: input.platform,
            notes: input.notes ?? null,
          });
          return { id: r?.[0]?.insertId as number, ok: true } as const;
        } catch (e: any) {
          if (String(e.message || "").toLowerCase().includes("duplicate")) {
            throw new TRPCError({ code: "CONFLICT", message: "Slug já existe — escolha outro" });
          }
          throw e;
        }
      }),
    updateSource: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          agentId: z.number().int().positive(),
          patch: z.object({
            name: z.string().min(2).max(120).optional(),
            enabled: z.boolean().optional(),
            platform: z.string().max(60).optional(),
            notes: z.string().max(2000).nullable().optional(),
          }),
        })
      )
      .mutation(async ({ input }) => {
        const { getDb } = await import("./db");
        const { externalEventSources } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db
          .update(externalEventSources)
          .set(input.patch)
          .where(and(eq(externalEventSources.id, input.id), eq(externalEventSources.agentId, input.agentId)));
        return { ok: true } as const;
      }),
    rotateSecret: protectedProcedure
      .input(z.object({ id: z.number().int().positive(), agentId: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const { getDb } = await import("./db");
        const { externalEventSources } = await import("../drizzle/schema");
        const { generateSecret } = await import("./external/hmac");
        const { eq, and } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const newSecret = generateSecret();
        await db
          .update(externalEventSources)
          .set({ secret: newSecret })
          .where(and(eq(externalEventSources.id, input.id), eq(externalEventSources.agentId, input.agentId)));
        return { ok: true, secret: newSecret } as const;
      }),
    deleteSource: protectedProcedure
      .input(z.object({ id: z.number().int().positive(), agentId: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const { getDb } = await import("./db");
        const { externalEventSources } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db
          .delete(externalEventSources)
          .where(and(eq(externalEventSources.id, input.id), eq(externalEventSources.agentId, input.agentId)));
        return { ok: true } as const;
      }),

    // ---- RULES ----
    listRules: protectedProcedure
      .input(agentScopedSchema)
      .query(async ({ input }) => {
        const { getDb } = await import("./db");
        const { externalEventRules } = await import("../drizzle/schema");
        const { eq, asc } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) return [];
        return db
          .select()
          .from(externalEventRules)
          .where(eq(externalEventRules.agentId, input.agentId))
          .orderBy(asc(externalEventRules.eventType), asc(externalEventRules.priority));
      }),
    upsertRule: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive().optional(),
          agentId: z.number().int().positive(),
          sourceId: z.number().int().positive().nullable().optional(),
          eventType: z.string().min(1).max(80),
          name: z.string().min(2).max(160),
          description: z.string().max(2000).nullable().optional(),
          actions: z.array(z.any()).min(1, { message: "Pelo menos uma ação" }),
          enabled: z.boolean().default(true),
          createLeadIfMissing: z.boolean().default(true),
          priority: z.number().int().min(0).max(10000).default(100),
        })
      )
      .mutation(async ({ input }) => {
        const { getDb } = await import("./db");
        const { externalEventRules } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        if (input.id) {
          await db
            .update(externalEventRules)
            .set({
              sourceId: input.sourceId ?? null,
              eventType: input.eventType,
              name: input.name,
              description: input.description ?? null,
              actions: input.actions,
              enabled: input.enabled,
              createLeadIfMissing: input.createLeadIfMissing,
              priority: input.priority,
            })
            .where(and(eq(externalEventRules.id, input.id), eq(externalEventRules.agentId, input.agentId)));
          return { id: input.id, ok: true } as const;
        }
        const r: any = await db.insert(externalEventRules).values({
          agentId: input.agentId,
          sourceId: input.sourceId ?? null,
          eventType: input.eventType,
          name: input.name,
          description: input.description ?? null,
          actions: input.actions,
          enabled: input.enabled,
          createLeadIfMissing: input.createLeadIfMissing,
          priority: input.priority,
        });
        return { id: r?.[0]?.insertId as number, ok: true } as const;
      }),
    deleteRule: protectedProcedure
      .input(z.object({ id: z.number().int().positive(), agentId: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const { getDb } = await import("./db");
        const { externalEventRules } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db
          .delete(externalEventRules)
          .where(and(eq(externalEventRules.id, input.id), eq(externalEventRules.agentId, input.agentId)));
        return { ok: true } as const;
      }),

    // ---- LOG / EVENTS ----
    listEvents: protectedProcedure
      .input(
        z.object({
          agentId: z.number().int().positive(),
          status: z
            .enum(["received", "matched", "unmatched", "processed", "ignored", "failed"])
            .optional(),
          eventType: z.string().max(80).optional(),
          limit: z.number().int().min(1).max(200).default(100),
        })
      )
      .query(async ({ input }) => {
        const { getDb } = await import("./db");
        const { externalEvents } = await import("../drizzle/schema");
        const { eq, and, desc } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) return [];
        const conds = [eq(externalEvents.agentId, input.agentId)];
        if (input.status) conds.push(eq(externalEvents.status, input.status));
        if (input.eventType) conds.push(eq(externalEvents.eventType, input.eventType));
        return db
          .select()
          .from(externalEvents)
          .where(and(...conds))
          .orderBy(desc(externalEvents.receivedAt))
          .limit(input.limit);
      }),
    retryEvent: protectedProcedure
      .input(z.object({ id: z.number().int().positive(), agentId: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const { getDb } = await import("./db");
        const { externalEvents, externalEventSources } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        const { extractIdentifiers } = await import("./external/identify");
        const { loadRulesFor, executeRuleActions } = await import("./external/engine");
        const { findOrCreateLead } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const evRows = await db
          .select()
          .from(externalEvents)
          .where(and(eq(externalEvents.id, input.id), eq(externalEvents.agentId, input.agentId)))
          .limit(1);
        const ev = evRows[0];
        if (!ev) throw new TRPCError({ code: "NOT_FOUND" });
        const srcRows = await db
          .select()
          .from(externalEventSources)
          .where(eq(externalEventSources.id, ev.sourceId))
          .limit(1);
        const src = srcRows[0];
        if (!src) throw new TRPCError({ code: "NOT_FOUND", message: "source removida" });

        const ids = extractIdentifiers(ev.payload);
        const rules = await loadRulesFor(input.agentId, ev.eventType, src.id);
        if (rules.length === 0) {
          await db
            .update(externalEvents)
            .set({ status: "ignored", processedAt: new Date(), errorMessage: "nenhuma regra" })
            .where(eq(externalEvents.id, input.id));
          return { ok: true, status: "ignored" } as const;
        }
        let leadId = ev.leadId;
        if (!leadId && ids.phone) {
          leadId = await findOrCreateLead(input.agentId, ids.phone, ids.name ?? undefined);
        }
        if (!leadId) {
          await db
            .update(externalEvents)
            .set({ status: "unmatched", processedAt: new Date(), errorMessage: "sem lead" })
            .where(eq(externalEvents.id, input.id));
          return { ok: true, status: "unmatched" } as const;
        }
        const allApplied: any[] = [];
        let anyError = false;
        for (const rule of rules) {
          const applied = await executeRuleActions({
            agentId: input.agentId,
            leadId,
            eventType: ev.eventType,
            rule,
            payload: ev.payload,
          });
          allApplied.push({ ruleId: rule.id, name: rule.name, applied });
          if (applied.some((a) => !a.ok)) anyError = true;
        }
        await db
          .update(externalEvents)
          .set({
            status: anyError ? "failed" : "processed",
            leadId,
            actionsApplied: allApplied,
            processedAt: new Date(),
          })
          .where(eq(externalEvents.id, input.id));
        return { ok: true, status: anyError ? "failed" : "processed" } as const;
      }),
  }),

  // ============================================================
  // MESSAGE RETRIES — reenvio automático de mensagens falhadas
  // ============================================================
  messageRetries: router({
    list: protectedProcedure
      .input(
        z.object({
          agentId: z.number().int().positive(),
          status: z
            .enum(["pending", "succeeded", "exhausted", "cancelled", "cancelled_by_reply"])
            .optional(),
          limit: z.number().int().min(1).max(500).default(100),
          search: z.string().max(120).optional().nullable(),
        })
      )
      .query(async ({ input }) => {
        const { listMessageRetries } = await import("./db");
        const rows = await listMessageRetries(input.agentId, {
          status: input.status,
          limit: input.limit,
          search: input.search,
        });
        return rows;
      }),
    countPending: protectedProcedure
      .input(agentScopedSchema)
      .query(async ({ input }) => {
        const { countPendingRetries } = await import("./db");
        const count = await countPendingRetries(input.agentId);
        return { count } as const;
      }),
    retryNow: protectedProcedure
      .input(
        z.object({ id: z.number().int().positive(), agentId: z.number().int().positive() })
      )
      .mutation(async ({ input }) => {
        const { getMessageRetry, updateMessageRetry } = await import("./db");
        const r = await getMessageRetry(input.id);
        if (!r || r.agentId !== input.agentId)
          throw new TRPCError({ code: "NOT_FOUND" });
        if (r.status !== "pending" && r.status !== "exhausted") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `cannot retry from status=${r.status}`,
          });
        }
        await updateMessageRetry(input.id, {
          status: "pending",
          nextRetryAt: new Date(),
          completedAt: null as any,
        });
        return { ok: true } as const;
      }),
    cancel: protectedProcedure
      .input(
        z.object({ id: z.number().int().positive(), agentId: z.number().int().positive() })
      )
      .mutation(async ({ input }) => {
        const { getMessageRetry, updateMessageRetry } = await import("./db");
        const r = await getMessageRetry(input.id);
        if (!r || r.agentId !== input.agentId)
          throw new TRPCError({ code: "NOT_FOUND" });
        await updateMessageRetry(input.id, {
          status: "cancelled",
          lastError: "cancelled by user",
          completedAt: new Date(),
        });
        return { ok: true } as const;
      }),
  }),
});

function csvEscape(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export type AppRouter = typeof appRouter;

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
  getBrainByAgent,
  getBusinessHours,
  getConversationById,
  getLeadById,
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
} from "./db";
import { storagePut } from "./storage";
import { processInboundForReply } from "./ai/orchestrator";
import { dispatchActions } from "./whatsapp/dispatcher";
import { qualifyLead } from "./ai/qualifier";
import { AVAILABLE_LLM_MODELS } from "../shared/llm-models";

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
          }),
        })
      )
      .mutation(({ input }) => updateAgent(input.id, input.patch)),
    delete: protectedProcedure.input(idSchema).mutation(({ input }) => deleteAgent(input.id)),
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
          }),
        })
      )
      .mutation(({ input }) => updateStep(input.id, input.patch)),
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
        });
      }),
    delete: protectedProcedure.input(idSchema).mutation(({ input }) => deleteMedia(input.id)),

    listTriggers: protectedProcedure
      .input(agentScopedSchema)
      .query(({ input }) => listTriggers(input.agentId)),
    createTrigger: protectedProcedure
      .input(
        z.object({
          agentId: z.number().int().positive(),
          mediaId: z.number().int().positive(),
          triggerType: z.enum(["keyword", "step", "ai_decision"]),
          keywords: z.string().nullable().optional(),
          stepId: z.number().int().nullable().optional(),
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
            triggerType: z.enum(["keyword", "step", "ai_decision"]).optional(),
            keywords: z.string().nullable().optional(),
            stepId: z.number().int().nullable().optional(),
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
        await dispatchActions({
          agent,
          conversationId: conv.id,
          actions: [{ type: "text", text: input.text }],
          sender: "human",
        });
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
        // Simulação: NÃO envia ao WhatsApp, apenas grava no DB
        for (const a of result.actions) {
          if (a.type === "text") {
            await appendMessage({
              conversationId: convId,
              direction: "outbound",
              sender: "ai",
              contentType: "text",
              body: a.text,
            });
          } else {
            await appendMessage({
              conversationId: convId,
              direction: "outbound",
              sender: "ai",
              contentType: "image",
              mediaId: a.mediaId,
            });
          }
        }
        return { conversationId: convId, ...result };
      }),
    reset: protectedProcedure
      .input(z.object({ conversationId: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        await cancelPendingJobsForConversation(input.conversationId);
        await updateConversation(input.conversationId, {
          aiPaused: false,
          status: "open",
          currentStepId: null,
          sentMediaIds: [],
        });
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

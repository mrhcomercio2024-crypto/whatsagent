import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getAgentById, getConversationById, updateConversation } from "../db";
import { dispatchActions } from "../whatsapp/dispatcher";
import {
  type FacebookInstagramAsset,
  MetaInstagramError,
  getInstagramProfile,
} from "./client";
import { createInstagramConnectUrl, finalizeFacebookInstagramAsset } from "./oauth";
import { decryptInstagramToken, encryptInstagramToken } from "./crypto";
import {
  getInstagramIntegrationByAgent,
  getInstagramConversation,
  getInstagramMetrics,
  listInstagramLogs,
  listInstagramConversations,
  logInstagram,
  updateInstagramIntegration,
} from "./db";
import {
  INSTAGRAM_CALLBACK_URL,
  INSTAGRAM_META_APP_ID,
  INSTAGRAM_OAUTH_REDIRECT_URI,
} from "./config";

const input = z.object({ agentId: z.number().int().positive() });
const inboxInput = input.extend({
  limit: z.number().int().min(1).max(500).default(200),
  status: z.enum(["open", "human_handoff", "closed", "archived"]).optional(),
  temperature: z.enum(["hot", "warm", "cold", "unknown"]).optional(),
  tag: z.string().max(100).optional(),
  search: z.string().max(200).optional(),
  handoff: z.boolean().optional(),
  unread: z.boolean().optional(),
  minLeadScore: z.number().int().min(0).max(100).optional(),
});

function publicStatus(integration: Awaited<ReturnType<typeof getInstagramIntegrationByAgent>>) {
  return {
    configured: Boolean(integration),
    connected: Boolean(integration?.isConnected && integration.accessTokenEncrypted),
    oauthProvider: integration?.oauthProvider ?? "facebook",
    facebookPageId: integration?.facebookPageId ?? null,
    facebookPageName: integration?.facebookPageName ?? null,
    accountId: integration?.instagramAccountId ?? null,
    username: integration?.username ?? null,
    accountName: integration?.accountName ?? null,
    profilePictureUrl: integration?.profilePictureUrl ?? null,
    tokenStatus: integration?.tokenStatus ?? "missing",
    tokenExpiresAt: integration?.tokenExpiresAt ?? null,
    scopes: Array.isArray(integration?.scopes) ? integration.scopes : [],
    webhookStatus: integration?.webhookStatus ?? "pending",
    webhookSubscribedAt: integration?.webhookSubscribedAt ?? null,
    lastWebhookAt: integration?.lastWebhookAt ?? null,
    lastInboundAt: integration?.lastInboundAt ?? null,
    lastOutboundAt: integration?.lastOutboundAt ?? null,
    lastError: integration?.lastError ?? null,
    lastErrorCode: integration?.lastErrorCode ?? null,
    lastErrorAt: integration?.lastErrorAt ?? null,
    metaAppId: INSTAGRAM_META_APP_ID,
    callbackUrl: INSTAGRAM_CALLBACK_URL,
    oauthRedirectUri: INSTAGRAM_OAUTH_REDIRECT_URI,
  };
}

export const instagramRouter = router({
  status: protectedProcedure.input(input).query(async ({ input }) => {
    return publicStatus(await getInstagramIntegrationByAgent(input.agentId));
  }),
  connectUrl: protectedProcedure.input(input).mutation(async ({ input, ctx }) => {
    const agent = await getAgentById(input.agentId);
    if (!agent) throw new TRPCError({ code: "NOT_FOUND", message: "Agente não encontrado." });
    return { url: await createInstagramConnectUrl(input.agentId, ctx.user.id) };
  }),
  pendingAssets: protectedProcedure.input(input).query(async ({ input }) => {
    const integration = await getInstagramIntegrationByAgent(input.agentId);
    if (!integration?.pendingAssetsEncrypted) return [];
    try {
      const assets = JSON.parse(
        decryptInstagramToken(integration.pendingAssetsEncrypted),
      ) as FacebookInstagramAsset[];
      return assets.map(asset => ({
        pageId: asset.pageId,
        pageName: asset.pageName,
        instagramAccountId: asset.instagramAccountId,
        instagramUsername: asset.instagramUsername ?? null,
        instagramName: asset.instagramName ?? null,
        profilePictureUrl: asset.profilePictureUrl ?? null,
      }));
    } catch {
      return [];
    }
  }),
  selectAsset: protectedProcedure
    .input(
      input.extend({
        pageId: z.string().min(1).max(80),
        instagramAccountId: z.string().min(1).max(80),
      }),
    )
    .mutation(async ({ input }) => {
      const integration = await getInstagramIntegrationByAgent(input.agentId);
      if (!integration?.pendingAssetsEncrypted) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Não há contas pendentes." });
      }
      let assets: FacebookInstagramAsset[] = [];
      try {
        assets = JSON.parse(
          decryptInstagramToken(integration.pendingAssetsEncrypted),
        ) as FacebookInstagramAsset[];
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Seleção expirada. Conecte novamente." });
      }
      const asset = assets.find(
        candidate =>
          candidate.pageId === input.pageId &&
          candidate.instagramAccountId === input.instagramAccountId,
      );
      if (!asset) throw new TRPCError({ code: "FORBIDDEN", message: "Conta não autorizada." });
      const updated = await finalizeFacebookInstagramAsset(input.agentId, asset);
      return { ok: true as const, status: publicStatus(updated) };
    }),
  healthCheck: protectedProcedure.input(input).mutation(async ({ input }) => {
    const integration = await getInstagramIntegrationByAgent(input.agentId);
    if (!integration?.accessTokenEncrypted) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Instagram ainda não conectado." });
    }
    try {
      if (!integration.instagramAccountId || !integration.facebookPageId) {
        throw new Error("INSTAGRAM_FACEBOOK_ASSET_MISSING");
      }
      const token = decryptInstagramToken(integration.accessTokenEncrypted);
      const profile = await getInstagramProfile(integration.instagramAccountId, token);
      const updated = await updateInstagramIntegration(input.agentId, {
        username: profile.username ?? integration.username,
        accountName: profile.name ?? integration.accountName,
        profilePictureUrl: profile.profile_picture_url ?? integration.profilePictureUrl,
        tokenStatus: "valid",
        isConnected: true,
        lastSyncAt: new Date(),
        lastError: null,
        lastErrorCode: null,
        lastErrorSubcode: null,
        lastErrorAt: null,
      });
      await logInstagram({
        agentId: input.agentId,
        integrationId: integration.id,
        eventType: "health_check_ok",
        message: "Health check Instagram concluído.",
      });
      return { ok: true as const, status: publicStatus(updated) };
    } catch (error) {
      const meta = error instanceof MetaInstagramError ? error : null;
      await updateInstagramIntegration(input.agentId, {
        tokenStatus: meta && [190, 102].includes(Number(meta.code)) ? "revoked" : "error",
        isConnected: false,
        lastError: error instanceof Error ? error.message.slice(0, 500) : "Instagram health check failed",
        lastErrorCode: meta?.code ?? null,
        lastErrorSubcode: meta?.subcode ?? null,
        lastErrorAt: new Date(),
      });
      throw new TRPCError({ code: "BAD_GATEWAY", message: "A Meta recusou o teste da conexão." });
    }
  }),
  disconnect: protectedProcedure.input(input).mutation(async ({ input }) => {
    const integration = await updateInstagramIntegration(input.agentId, {
      accessTokenEncrypted: null,
      pendingAssetsEncrypted: null,
      tokenExpiresAt: null,
      tokenStatus: "missing",
      facebookPageId: null,
      facebookPageName: null,
      instagramAccountId: null,
      isConnected: false,
    });
    await logInstagram({
      agentId: input.agentId,
      integrationId: integration?.id ?? null,
      eventType: "disconnected",
      message: "Conta Instagram desconectada pelo operador.",
    });
    return { ok: true as const };
  }),
  logs: protectedProcedure
    .input(input.extend({ limit: z.number().int().min(1).max(200).default(100) }))
    .query(({ input }) => listInstagramLogs(input.agentId, input.limit)),
  metrics: protectedProcedure
    .input(input.extend({ days: z.number().int().min(1).max(365).default(30) }))
    .query(({ input }) => getInstagramMetrics(input.agentId, input.days)),
  inbox: protectedProcedure.input(inboxInput).query(({ input }) => {
    const { agentId, ...filters } = input;
    return listInstagramConversations(agentId, filters);
  }),
  conversation: protectedProcedure
    .input(input.extend({ conversationId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const result = await getInstagramConversation(input.agentId, input.conversationId);
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Conversa Instagram não encontrada." });
      return result;
    }),
  setHandoff: protectedProcedure
    .input(
      input.extend({
        conversationId: z.number().int().positive(),
        assumed: z.boolean(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const conversation = await getConversationById(input.conversationId);
      if (!conversation || conversation.agentId !== input.agentId || conversation.channel !== "instagram") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversa Instagram não encontrada." });
      }
      await updateConversation(input.conversationId, {
        aiPaused: input.assumed,
        status: input.assumed ? "human_handoff" : "open",
        assignedUserId: input.assumed ? ctx.user.id : null,
      });
      await logInstagram({
        agentId: input.agentId,
        conversationId: input.conversationId,
        leadId: conversation.leadId,
        eventType: input.assumed ? "handoff_assumed" : "handoff_returned_to_ai",
        message: input.assumed ? "Operador assumiu a conversa." : "Conversa devolvida ao Ravi.",
        metadata: { userId: ctx.user.id },
      });
      return { ok: true as const };
    }),
  sendHumanMessage: protectedProcedure
    .input(
      input.extend({
        conversationId: z.number().int().positive(),
        text: z.string().trim().min(1).max(2000),
      }),
    )
    .mutation(async ({ input }) => {
      const conversation = await getConversationById(input.conversationId);
      if (!conversation || conversation.agentId !== input.agentId || conversation.channel !== "instagram") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversa Instagram não encontrada." });
      }
      if (!conversation.aiPaused || conversation.status !== "human_handoff") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Assuma a conversa antes de responder como humano.",
        });
      }
      const agent = await getAgentById(input.agentId);
      if (!agent) throw new TRPCError({ code: "NOT_FOUND", message: "Agente não encontrado." });
      await dispatchActions({
        agent,
        conversationId: input.conversationId,
        sender: "human",
        actions: [{ type: "text", text: input.text }],
      });
      return { ok: true as const };
    }),
});

import { createHash, randomUUID } from "crypto";
import type { Agent } from "../../drizzle/schema";
import {
  appendMessage,
  getAgentById,
  getConversationById,
  getMediaById,
  getLeadById,
  getStepById,
  recordMetric,
} from "../db";
import { processInboundForReply } from "../ai/orchestrator";
import { splitMessage } from "../ai/splitter";
import { computeTypingDelayMs } from "../ai/humanize";
import { recognizeAudio } from "../ai/mediaRecognition";
import { storageGetSignedUrl, storagePut } from "../storage";
import {
  beginPublicRequest,
  completePublicRequest,
  failPublicRequest,
  persistCapturedContact,
  recordPublicConversion,
  requirePublicSimulatorSession,
  updatePublicSimulatorSession,
  listPublicSessionMessages,
} from "./db";
import { getActiveSubscriptionForSession, revokeAllPushSubscriptionsForSession } from "./push/db";
import {
  cancelPendingRecoveryJobs,
  recordCheckoutAfterPush,
  scheduleRecoverySequence,
} from "./recovery/service";
import { isPushOptOutMessage, isStrongInterest, scoreObjectiveInterest } from "./recovery/interest";

const AUDIO_MIMES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/m4a",
]);
const MAX_AUDIO_BYTES = 16 * 1024 * 1024;

export type PublicSimulatorAction =
  | { kind: "text"; text: string; typingMs: number }
  | {
      kind: "media";
      mediaId: number;
      mediaType: "image" | "video" | "audio" | "document";
      mediaUrl: string | null;
      caption: string | null;
      filename: string | null;
      typingMs: number;
    }
  | {
      kind: "checkout";
      text: string;
      url: string;
      buttonText: string;
      typingMs: number;
    };

export function normalizePhoneCandidate(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 13) return null;
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  if (digits.startsWith("55")) return `+${digits}`;
  return `+${digits}`;
}

export function extractContactFacts(text: string): {
  name?: string;
  phone?: string;
  email?: string;
} {
  const out: { name?: string; phone?: string; email?: string } = {};
  const email = text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0];
  if (email) out.email = email.toLowerCase();

  const phoneRaw =
    text.match(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4}[\s.-]?\d{4}/)?.[0] ??
    (/^\s*[+\d().\s-]{10,20}\s*$/.test(text) ? text : undefined);
  if (phoneRaw) {
    const phone = normalizePhoneCandidate(phoneRaw);
    if (phone) out.phone = phone;
  }

  const name = text.match(
    /(?:meu nome (?:é|e)|me chamo|pode me chamar de|sou (?:o|a)?)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]*(?:\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]*){0,3})/i,
  )?.[1];
  if (name) {
    out.name = name
      .trim()
      .replace(/\s+/g, " ")
      .split(" ")
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ");
  }
  return out;
}

export function matchesCheckoutRequest(text: string, patterns: unknown): boolean {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const list = Array.isArray(patterns) ? patterns : [];
  return list.some(p => {
    const needle = String(p || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
    return needle.length > 1 && normalized.includes(needle);
  });
}

export function buildTrackedCheckoutUrl(checkoutUrl: string, publicId: string): string {
  try {
    const url = new URL(checkoutUrl);
    if (!url.searchParams.has("utm_source")) {
      url.searchParams.set("utm_source", "simulador_whatsapp");
    }
    if (!url.searchParams.has("utm_medium")) {
      url.searchParams.set("utm_medium", "conversa_ravi");
    }
    url.searchParams.set("wa_sim_session", publicId);
    return url.toString();
  } catch {
    return checkoutUrl;
  }
}

export function decodeAudioBase64(data: string) {
  const stripped = data.replace(/^data:[^;]+;base64,/, "");
  const buffer = Buffer.from(stripped, "base64");
  if (!buffer.length) throw new Error("Áudio vazio");
  if (buffer.length > MAX_AUDIO_BYTES) {
    throw new Error("O áudio deve ter no máximo 16 MB");
  }
  return buffer;
}

function audioExtension(mimeType: string) {
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  return "webm";
}

function timing(agent: Agent) {
  return {
    debounceSeconds: Math.min(agent.debounceSeconds, 2),
    typingSimulationEnabled: agent.typingSimulationEnabled,
    typingCps: Math.max(agent.typingCps, 16),
    typingMinDelayMs: Math.min(agent.typingMinDelayMs, 650),
    typingMaxDelayMs: Math.min(agent.typingMaxDelayMs, 3500),
    interMessageDelayMs: Math.min(agent.interMessageDelayMs, 850),
  };
}

async function enrichAndPersistActions(
  agent: Agent,
  conversationId: number,
  actions: Array<{ type: "text"; text: string } | { type: "media"; mediaId: number }>,
) {
  const expanded: Array<
    { type: "text"; text: string } | { type: "media"; mediaId: number }
  > = [];
  for (const action of actions) {
    if (action.type === "text") {
      for (const piece of splitMessage(action.text, {
        enabled: agent.splitLongMessages,
        maxChars: agent.splitMaxChars,
      })) {
        expanded.push({ type: "text", text: piece });
      }
    } else {
      expanded.push(action);
    }
  }

  return Promise.all(
    expanded.map(async (action): Promise<PublicSimulatorAction> => {
      if (action.type === "text") {
        await appendMessage({
          conversationId,
          direction: "outbound",
          sender: "ai",
          contentType: "text",
          body: action.text,
        });
        return {
          kind: "text",
          text: action.text,
          typingMs: computeTypingDelayMs(action.text.length, agent),
        };
      }
      const media = await getMediaById(action.mediaId);
      const mediaType = (media?.mediaType ?? "image") as
        | "image"
        | "video"
        | "audio"
        | "document";
      await appendMessage({
        conversationId,
        direction: "outbound",
        sender: "ai",
        contentType: mediaType,
        body: media?.caption ?? null,
        mediaUrl: media?.storageUrl ?? null,
        mediaId: action.mediaId,
      });
      return {
        kind: "media",
        mediaId: action.mediaId,
        mediaType,
        mediaUrl: media?.storageUrl ?? null,
        caption: media?.caption ?? null,
        filename: media?.name ?? null,
        typingMs: computeTypingDelayMs((media?.caption?.length ?? 0) + 60, agent),
      };
    }),
  );
}

export async function processPublicSimulatorTurn(input: {
  publicId: string;
  token: string;
  requestId: string;
  kind: "start" | "text" | "audio";
  text?: string;
  audioBase64?: string;
  audioMimeType?: string;
  audioDurationMs?: number;
  config: {
    id: number;
    agentId: number;
    checkoutUrl?: string | null;
    checkoutButtonText: string;
    checkoutRequestPatterns?: unknown;
    pushEnabled?: boolean;
    pushConsentEnabled?: boolean;
    pushConsentMinInteractions?: number;
    pushInterestScoreThreshold?: number;
    pushStrongInterestScore?: number;
  };
}) {
  const session = await requirePublicSimulatorSession(input.publicId, input.token);
  if (session.configId !== input.config.id || session.agentId !== input.config.agentId) {
    throw new Error("INVALID_PUBLIC_SESSION");
  }
  const request = await beginPublicRequest(session.id, input.requestId, input.kind);
  if (!request.created) {
    if (request.request.status === "completed" && request.request.response) {
      return request.request.response as any;
    }
    throw new Error("REQUEST_ALREADY_PROCESSING");
  }

  try {
    if (input.kind === "start" && session.status !== "waiting") {
      throw new Error("CONVERSATION_ALREADY_STARTED");
    }

    const agent = await getAgentById(session.agentId);
    if (!agent || agent.status !== "active") throw new Error("AGENT_UNAVAILABLE");

    // Uma nova mensagem do lead invalida qualquer abandono anterior.
    await cancelPendingRecoveryJobs(session.id, "lead_replied");

    let inboundText = (input.text || "").trim();
    let inputMediaUrl: string | null = null;
    let publicTranscript: string | null = null;

    if (input.kind === "audio") {
      const mimeType = (input.audioMimeType || "audio/webm").toLowerCase();
      if (!AUDIO_MIMES.has(mimeType)) throw new Error("Formato de áudio não suportado");
      const buffer = decodeAudioBase64(input.audioBase64 || "");
      const ext = audioExtension(mimeType);
      const stored = await storagePut(
        `public-simulator/${session.publicId}/audio-${Date.now()}.${ext}`,
        buffer,
        mimeType,
      );
      inputMediaUrl = stored.url;
      const signedUrl = await storageGetSignedUrl(stored.key);
      const recognition = await recognizeAudio(signedUrl, {
        agentId: session.agentId,
        conversationId: session.conversationId,
        leadId: session.leadId,
      });
      inboundText = recognition.text;
      publicTranscript = recognition.ok
        ? recognition.text.replace(/^\[O lead enviou um áudio\. Transcrição: "|"\]$/g, "")
        : null;
      await appendMessage({
        conversationId: session.conversationId,
        direction: "inbound",
        sender: "lead",
        contentType: "audio",
        body: inboundText,
        mediaUrl: inputMediaUrl,
        metadata: {
          publicSimulator: true,
          transcript: publicTranscript,
          durationMs: input.audioDurationMs ?? null,
        },
      });
    } else {
      if (!inboundText) throw new Error("Mensagem vazia");
      if (inboundText.length > 4000) throw new Error("Mensagem muito longa");
      await appendMessage({
        conversationId: session.conversationId,
        direction: "inbound",
        sender: "lead",
        contentType: "text",
        body: inboundText,
        metadata: { publicSimulator: true, kind: input.kind },
      });
    }

    const contact = extractContactFacts(inboundText);
    if (contact.name || contact.phone || contact.email) {
      await persistCapturedContact(session, contact);
    }

    if (input.kind === "start") {
      await updatePublicSimulatorSession(session.id, {
        status: "active",
        startedAt: new Date(),
      });
    }

    const optedOut = isPushOptOutMessage(inboundText);
    if (optedOut) {
      await revokeAllPushSubscriptionsForSession(session.id, "denied");
      await cancelPendingRecoveryJobs(session.id, "lead_opted_out");
    }

    const historyForInterest = await listPublicSessionMessages(session.conversationId);
    const inboundTexts = historyForInterest
      .filter(message => message.direction === "inbound" && typeof message.body === "string")
      .map(message => message.body || "");
    const lead = await getLeadById(session.leadId);
    const conversation = await getConversationById(session.conversationId);
    const currentStep = conversation?.currentStepId
      ? await getStepById(conversation.currentStepId)
      : null;
    const interest = scoreObjectiveInterest({
      inboundTexts,
      interactionCount: inboundTexts.length,
      temperature: lead?.temperature,
      advancedStage: Boolean(currentStep && currentStep.orderIndex >= 2),
      previousLeadScore: session.leadScore,
      scoreThreshold: input.config.pushInterestScoreThreshold ?? 40,
    });
    await updatePublicSimulatorSession(session.id, {
      leadScore: interest.score,
      interestSignals: interest.signals,
    });

    await recordMetric({
      agentId: agent.id,
      conversationId: session.conversationId,
      eventType: "message_received",
      metadata: { publicSimulator: true, kind: input.kind },
    });

    const wantsCheckout = Boolean(
      input.config.checkoutUrl &&
        matchesCheckoutRequest(inboundText, input.config.checkoutRequestPatterns),
    );
    if (wantsCheckout && !session.checkoutRequestedAt) {
      const now = new Date();
      await updatePublicSimulatorSession(session.id, { checkoutRequestedAt: now });
      await recordPublicConversion({
        sessionId: session.id,
        agentId: session.agentId,
        eventId: `requested:${session.publicId}`,
        eventType: "checkout_requested",
        payload: { text: inboundText },
      });
    }

    const result = await processInboundForReply({
      agent,
      conversationId: session.conversationId,
      inboundText,
      isSimulation: true,
    });

    const actions = await enrichAndPersistActions(
      agent,
      session.conversationId,
      result.actions,
    );

    if (wantsCheckout && input.config.checkoutUrl) {
      const checkoutText = "Perfeito! Vou deixar o link seguro para você continuar:";
      const trackedCheckoutUrl = buildTrackedCheckoutUrl(
        input.config.checkoutUrl,
        session.publicId,
      );
      await appendMessage({
        conversationId: session.conversationId,
        direction: "outbound",
        sender: "ai",
        contentType: "text",
        body: `${checkoutText}\n${trackedCheckoutUrl}`,
        metadata: { publicSimulator: true, checkout: true },
      });
      actions.push({
        kind: "checkout",
        text: checkoutText,
        url: trackedCheckoutUrl,
        buttonText: input.config.checkoutButtonText,
        typingMs: computeTypingDelayMs(checkoutText.length, agent),
      });
      const now = new Date();
      await updatePublicSimulatorSession(session.id, { checkoutLinkSentAt: now });
      await recordPublicConversion({
        sessionId: session.id,
        agentId: session.agentId,
        eventId: `link-sent:${session.publicId}:${input.requestId}`,
        eventType: "checkout_link_sent",
        payload: { url: trackedCheckoutUrl },
      });
    }

    const activeSubscription = await getActiveSubscriptionForSession(session.id);
    if (activeSubscription && !optedOut && !wantsCheckout) {
      await scheduleRecoverySequence(session.id);
    }

    const consentEligible = Boolean(
      input.config.pushEnabled &&
        input.config.pushConsentEnabled &&
        !activeSubscription &&
        !session.pushConsentGrantedAt &&
        !session.pushConsentDeclinedAt &&
        !session.pushOptedOutAt &&
        inboundTexts.length >= (input.config.pushConsentMinInteractions ?? 4) &&
        interest.eligible,
    );
    const strongInterest = isStrongInterest({
      score: interest.score,
      strongThreshold: input.config.pushStrongInterestScore ?? 65,
      signals: interest.signals,
    });

    const response = {
      sessionId: session.publicId,
      conversationId: session.conversationId,
      handoff: result.handoff,
      stepAdvanced: result.stepAdvanced,
      outOfHours: result.outOfHours,
      actions,
      timing: timing(agent),
      inbound: {
        kind: input.kind === "audio" ? "audio" : "text",
        mediaUrl: inputMediaUrl,
        transcript: publicTranscript,
        durationMs: input.audioDurationMs ?? null,
      },
      pushConsent: {
        eligible: consentEligible,
        strongInterest,
        score: interest.score,
        signals: interest.signals,
      },
    };
    await completePublicRequest(input.requestId, response);
    return response;
  } catch (error) {
    await failPublicRequest(input.requestId, (error as Error).message);
    throw error;
  }
}

export async function trackCheckoutClick(input: {
  publicId: string;
  token: string;
}) {
  const session = await requirePublicSimulatorSession(input.publicId, input.token);
  const now = new Date();
  await updatePublicSimulatorSession(session.id, { checkoutClickedAt: now });
  await recordPublicConversion({
    sessionId: session.id,
    agentId: session.agentId,
    eventId: `clicked:${session.publicId}`,
    eventType: "checkout_clicked",
    payload: { at: now.toISOString() },
  });
  await recordCheckoutAfterPush(session.id);
  return { ok: true as const };
}

export function hashIp(value: string | undefined) {
  if (!value) return null;
  return createHash("sha256").update(value).digest("hex");
}

export function safeRequestId(input?: string) {
  const value = (input || randomUUID()).replace(/[^a-zA-Z0-9:_-]/g, "");
  return value.slice(0, 80) || randomUUID();
}

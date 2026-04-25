import {
  bigint,
  boolean,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * ────────────────────────────────────────────────────────────
 * USERS (template) — operadores humanos do painel
 * ────────────────────────────────────────────────────────────
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * ────────────────────────────────────────────────────────────
 * AGENTS — multi-agente. Cada agente tem cérebro, etapas, mídias, etc.
 * ────────────────────────────────────────────────────────────
 */
export const agents = mysqlTable("agents", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["active", "paused", "draft"]).default("draft").notNull(),
  // LLM padrão usado quando uma etapa não define o seu próprio
  defaultLlmModel: varchar("defaultLlmModel", { length: 80 }).default("gpt-4o").notNull(),
  // Persona condensada (nome do bot, voz, identidade)
  persona: text("persona"),
  // Idioma principal
  language: varchar("language", { length: 10 }).default("pt-BR").notNull(),
  // Modo de conexão WhatsApp: 'official' (Meta Cloud API) ou 'qr' (Baileys não oficial)
  connectionMode: mysqlEnum("connectionMode", ["official", "qr"]).default("official").notNull(),

  // — Comportamento humano —
  // Tempo (segundos) que o agente espera desde a última mensagem do lead antes de processar
  debounceSeconds: int("debounceSeconds").default(8).notNull(),
  // Simulação de digitação (typing…)
  typingSimulationEnabled: boolean("typingSimulationEnabled").default(true).notNull(),
  // Velocidade de digitação em caracteres por segundo (5–80)
  typingCps: int("typingCps").default(22).notNull(),
  // Atraso mínimo antes de começar a digitar (ms)
  typingMinDelayMs: int("typingMinDelayMs").default(800).notNull(),
  // Atraso máximo de digitação por mensagem (ms)
  typingMaxDelayMs: int("typingMaxDelayMs").default(8000).notNull(),
  // Pausa entre mensagens consecutivas do bot (ms)
  interMessageDelayMs: int("interMessageDelayMs").default(1200).notNull(),
  // Quebra de mensagens longas em vários balões para parecer mais humano
  splitLongMessages: boolean("splitLongMessages").default(true).notNull(),
  // Tamanho máximo (chars) de cada balão antes de forçar quebra
  splitMaxChars: int("splitMaxChars").default(220).notNull(),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Agent = typeof agents.$inferSelect;
export type InsertAgent = typeof agents.$inferInsert;

/**
 * ────────────────────────────────────────────────────────────
 * AGENT BRAIN — prompt mestre, regras, tom, produtos, objeções
 * 1:1 com agents
 * ────────────────────────────────────────────────────────────
 */
export const agentBrain = mysqlTable("agent_brain", {
  id: int("id").autoincrement().primaryKey(),
  agentId: int("agentId").notNull().unique(),
  // Prompt mestre completo (cérebro principal)
  masterPrompt: text("masterPrompt").notNull(),
  // Tom de voz e estilo de escrita
  tone: text("tone"),
  // Regras estritas que o agente NUNCA pode quebrar
  rules: text("rules"),
  // Catálogo de produtos / serviços
  products: text("products"),
  // Objeções comuns + tratamento
  objections: text("objections"),
  // Informações da empresa (FAQ rápido)
  companyInfo: text("companyInfo"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AgentBrain = typeof agentBrain.$inferSelect;
export type InsertAgentBrain = typeof agentBrain.$inferInsert;

/**
 * ────────────────────────────────────────────────────────────
 * SCRIPT STEPS — etapas obrigatórias do funil de atendimento
 * Ex.: Saudação → Qualificação → Apresentação → Fechamento
 * Cada etapa pode usar um LLM diferente.
 * ────────────────────────────────────────────────────────────
 */
export const scriptSteps = mysqlTable(
  "script_steps",
  {
    id: int("id").autoincrement().primaryKey(),
    agentId: int("agentId").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    orderIndex: int("orderIndex").notNull(),
    // Instrução específica desta etapa (anexada ao prompt mestre)
    instructions: text("instructions").notNull(),
    // Critérios para considerar a etapa cumprida e avançar à próxima
    completionCriteria: text("completionCriteria"),
    // LLM usado nesta etapa (se vazio, usa defaultLlmModel do agente)
    llmModel: varchar("llmModel", { length: 80 }),
    // Se true, agente NUNCA pode pular esta etapa
    isMandatory: boolean("isMandatory").default(true).notNull(),
    // Se true, agente envia EXATAMENTE o texto literal abaixo (sem reescrever)
    literalMode: boolean("literalMode").default(false).notNull(),
    literalText: text("literalText"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    agentOrderIdx: index("script_steps_agent_order_idx").on(table.agentId, table.orderIndex),
  })
);
export type ScriptStep = typeof scriptSteps.$inferSelect;
export type InsertScriptStep = typeof scriptSteps.$inferInsert;

/**
 * ────────────────────────────────────────────────────────────
 * KNOWLEDGE BASE — base de conhecimento textual (RAG simples)
 * ────────────────────────────────────────────────────────────
 */
export const knowledgeBase = mysqlTable(
  "knowledge_base",
  {
    id: int("id").autoincrement().primaryKey(),
    agentId: int("agentId").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    content: text("content").notNull(),
    tags: varchar("tags", { length: 500 }), // CSV simples
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    agentIdx: index("kb_agent_idx").on(table.agentId),
  })
);
export type KnowledgeBaseItem = typeof knowledgeBase.$inferSelect;
export type InsertKnowledgeBaseItem = typeof knowledgeBase.$inferInsert;

/**
 * ────────────────────────────────────────────────────────────
 * MEDIA ASSETS — imagens e vídeos disponíveis para o agente enviar
 * ────────────────────────────────────────────────────────────
 */
export const mediaAssets = mysqlTable(
  "media_assets",
  {
    id: int("id").autoincrement().primaryKey(),
    agentId: int("agentId").notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"), // descrição usada pela IA pra decidir quando enviar
    mediaType: mysqlEnum("mediaType", ["image", "video", "document", "audio"]).notNull(),
    storageKey: varchar("storageKey", { length: 500 }).notNull(),
    storageUrl: varchar("storageUrl", { length: 500 }).notNull(),
    mimeType: varchar("mimeType", { length: 100 }),
    caption: text("caption"), // legenda enviada junto
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    agentIdx: index("media_agent_idx").on(table.agentId),
  })
);
export type MediaAsset = typeof mediaAssets.$inferSelect;
export type InsertMediaAsset = typeof mediaAssets.$inferInsert;

/**
 * ────────────────────────────────────────────────────────────
 * MEDIA TRIGGERS — regras que disparam o envio de uma mídia
 * Tipos: keyword, step, ai_decision
 * ────────────────────────────────────────────────────────────
 */
export const mediaTriggers = mysqlTable(
  "media_triggers",
  {
    id: int("id").autoincrement().primaryKey(),
    agentId: int("agentId").notNull(),
    mediaId: int("mediaId").notNull(),
    triggerType: mysqlEnum("triggerType", ["keyword", "step", "ai_decision"]).notNull(),
    // Para keyword: lista CSV de palavras-chave (ex.: "preço,valor,quanto custa")
    keywords: varchar("keywords", { length: 500 }),
    // Para step: id da etapa em que deve ser enviada
    stepId: int("stepId"),
    // Apenas envie no máximo 1x por conversa
    sendOncePerConversation: boolean("sendOncePerConversation").default(true).notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    agentIdx: index("trigger_agent_idx").on(table.agentId),
  })
);
export type MediaTrigger = typeof mediaTriggers.$inferSelect;
export type InsertMediaTrigger = typeof mediaTriggers.$inferInsert;

/**
 * ────────────────────────────────────────────────────────────
 * WHATSAPP CONFIG — credenciais Meta Cloud API por agente
 * ────────────────────────────────────────────────────────────
 */
export const whatsappConfig = mysqlTable("whatsapp_config", {
  id: int("id").autoincrement().primaryKey(),
  agentId: int("agentId").notNull().unique(),
  phoneNumberId: varchar("phoneNumberId", { length: 80 }),
  businessAccountId: varchar("businessAccountId", { length: 80 }),
  // Token criptografado (texto longo)
  accessToken: text("accessToken"),
  // Token de verificação que você define no Meta para o webhook
  verifyToken: varchar("verifyToken", { length: 200 }),
  // App Secret (para validar X-Hub-Signature-256)
  appSecret: varchar("appSecret", { length: 200 }),
  // Telefone exibido (só visual)
  displayPhoneNumber: varchar("displayPhoneNumber", { length: 40 }),
  isConnected: boolean("isConnected").default(false).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type WhatsappConfig = typeof whatsappConfig.$inferSelect;
export type InsertWhatsappConfig = typeof whatsappConfig.$inferInsert;

/**
 * ────────────────────────────────────────────────────────────
 * WHATSAPP TEMPLATES — templates aprovados pela Meta (HSM)
 * ────────────────────────────────────────────────────────────
 */
export const whatsappTemplates = mysqlTable(
  "whatsapp_templates",
  {
    id: int("id").autoincrement().primaryKey(),
    agentId: int("agentId").notNull(),
    name: varchar("name", { length: 200 }).notNull(), // nome cadastrado na Meta
    languageCode: varchar("languageCode", { length: 10 }).default("pt_BR").notNull(),
    category: mysqlEnum("category", ["MARKETING", "UTILITY", "AUTHENTICATION"]).notNull(),
    bodyText: text("bodyText").notNull(), // texto com {{1}}, {{2}}...
    // Variáveis em ordem (apenas para a UI lembrar nomes/dicas)
    variables: json("variables"),
    status: mysqlEnum("status", ["approved", "pending", "rejected"]).default("approved").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    agentIdx: index("template_agent_idx").on(table.agentId),
  })
);
export type WhatsappTemplate = typeof whatsappTemplates.$inferSelect;
export type InsertWhatsappTemplate = typeof whatsappTemplates.$inferInsert;

/**
 * ────────────────────────────────────────────────────────────
 * LEADS — pessoas atendidas
 * ────────────────────────────────────────────────────────────
 */
export const leads = mysqlTable(
  "leads",
  {
    id: int("id").autoincrement().primaryKey(),
    agentId: int("agentId").notNull(),
    phoneNumber: varchar("phoneNumber", { length: 40 }).notNull(),
    name: varchar("name", { length: 200 }),
    email: varchar("email", { length: 320 }),
    temperature: mysqlEnum("temperature", ["hot", "warm", "cold", "unknown"])
      .default("unknown")
      .notNull(),
    qualificationNotes: text("qualificationNotes"),
    tags: varchar("tags", { length: 500 }),
    customFields: json("customFields"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    agentPhoneUnique: uniqueIndex("leads_agent_phone_unique").on(
      table.agentId,
      table.phoneNumber
    ),
  })
);
export type Lead = typeof leads.$inferSelect;
export type InsertLead = typeof leads.$inferInsert;

/**
 * ────────────────────────────────────────────────────────────
 * CONVERSATIONS — uma conversa por (agente, lead)
 * ────────────────────────────────────────────────────────────
 */
export const conversations = mysqlTable(
  "conversations",
  {
    id: int("id").autoincrement().primaryKey(),
    agentId: int("agentId").notNull(),
    leadId: int("leadId").notNull(),
    status: mysqlEnum("status", ["open", "human_handoff", "closed", "archived"])
      .default("open")
      .notNull(),
    aiPaused: boolean("aiPaused").default(false).notNull(),
    currentStepId: int("currentStepId"),
    // Última mensagem do lead (para calcular janela 24h)
    lastInboundAt: timestamp("lastInboundAt"),
    lastOutboundAt: timestamp("lastOutboundAt"),
    lastMessageAt: timestamp("lastMessageAt"),
    assignedUserId: int("assignedUserId"), // operador humano que assumiu
    sentMediaIds: json("sentMediaIds"), // ids de mídias já enviadas (controle once)
    // Debounce: horário em que a IA deve processar a conversa (coalesce de várias mensagens)
    pendingProcessAt: timestamp("pendingProcessAt"),
    // Memória evolutiva: resumo do que já aconteceu na conversa, atualizado pelo agente
    summary: text("summary"),
    summaryUpdatedAt: timestamp("summaryUpdatedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    agentLeadUnique: uniqueIndex("conv_agent_lead_unique").on(table.agentId, table.leadId),
    statusIdx: index("conv_status_idx").on(table.status),
  })
);
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;

/**
 * ────────────────────────────────────────────────────────────
 * MESSAGES — todas as mensagens de cada conversa
 * ────────────────────────────────────────────────────────────
 */
export const messages = mysqlTable(
  "messages",
  {
    id: int("id").autoincrement().primaryKey(),
    conversationId: int("conversationId").notNull(),
    direction: mysqlEnum("direction", ["inbound", "outbound"]).notNull(),
    sender: mysqlEnum("sender", ["lead", "ai", "human", "system"]).notNull(),
    contentType: mysqlEnum("contentType", ["text", "image", "video", "audio", "document", "template"])
      .default("text")
      .notNull(),
    body: text("body"), // texto ou caption
    mediaUrl: varchar("mediaUrl", { length: 500 }),
    mediaId: int("mediaId"), // referência ao media_assets se aplicável
    templateName: varchar("templateName", { length: 200 }),
    waMessageId: varchar("waMessageId", { length: 200 }), // id do WhatsApp
    waStatus: mysqlEnum("waStatus", ["queued", "sent", "delivered", "read", "failed"]),
    metadata: json("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    convIdx: index("msg_conv_idx").on(table.conversationId, table.createdAt),
    waIdx: index("msg_wa_idx").on(table.waMessageId),
  })
);
export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

/**
 * ────────────────────────────────────────────────────────────
 * FOLLOWUP RULES — regras de reengajamento configuráveis
 * Lista ordenada de "tentativas" que o sistema seguirá quando o lead
 * ficar sem responder.
 * ────────────────────────────────────────────────────────────
 */
export const followupRules = mysqlTable(
  "followup_rules",
  {
    id: int("id").autoincrement().primaryKey(),
    agentId: int("agentId").notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    orderIndex: int("orderIndex").notNull(),
    // Quanto tempo após a última mensagem do lead (em minutos)
    delayMinutes: int("delayMinutes").notNull(),
    // Modo de envio: livre (texto IA), fixa (texto pré-definido), template (HSM)
    messageMode: mysqlEnum("messageMode", ["ai_generated", "fixed_text", "template"]).notNull(),
    // Texto fixo (se modo fixed_text) ou prompt extra (se ai_generated)
    fixedText: text("fixedText"),
    aiInstruction: text("aiInstruction"),
    // Template ID se messageMode === 'template'
    templateId: int("templateId"),
    templateVariables: json("templateVariables"), // valores ou expressões pra variáveis
    // Política de janela: auto = sistema decide, force_template, force_free
    windowPolicy: mysqlEnum("windowPolicy", ["auto", "force_template", "force_free"])
      .default("auto")
      .notNull(),
    // Se a conversa receber mensagem do lead, cancela follow-ups pendentes
    cancelOnReply: boolean("cancelOnReply").default(true).notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    agentOrderIdx: index("followup_agent_order_idx").on(table.agentId, table.orderIndex),
  })
);
export type FollowupRule = typeof followupRules.$inferSelect;
export type InsertFollowupRule = typeof followupRules.$inferInsert;

/**
 * ────────────────────────────────────────────────────────────
 * FOLLOWUP JOBS — jobs agendados gerados a partir das regras
 * ────────────────────────────────────────────────────────────
 */
export const followupJobs = mysqlTable(
  "followup_jobs",
  {
    id: int("id").autoincrement().primaryKey(),
    agentId: int("agentId").notNull(),
    conversationId: int("conversationId").notNull(),
    ruleId: int("ruleId").notNull(),
    scheduledAt: timestamp("scheduledAt").notNull(),
    status: mysqlEnum("status", ["pending", "sent", "cancelled", "failed"]).default("pending").notNull(),
    sentAt: timestamp("sentAt"),
    errorMessage: text("errorMessage"),
    attemptCount: int("attemptCount").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    statusIdx: index("job_status_idx").on(table.status, table.scheduledAt),
    convIdx: index("job_conv_idx").on(table.conversationId),
  })
);
export type FollowupJob = typeof followupJobs.$inferSelect;
export type InsertFollowupJob = typeof followupJobs.$inferInsert;

/**
 * ────────────────────────────────────────────────────────────
 * BUSINESS HOURS — horário de atendimento por agente
 * ────────────────────────────────────────────────────────────
 */
export const businessHours = mysqlTable("business_hours", {
  id: int("id").autoincrement().primaryKey(),
  agentId: int("agentId").notNull().unique(),
  enabled: boolean("enabled").default(false).notNull(),
  timezone: varchar("timezone", { length: 60 }).default("America/Sao_Paulo").notNull(),
  // Mapa por dia da semana (0=Dom..6=Sáb): {"1":{"start":"09:00","end":"18:00"}, ...}
  weekly: json("weekly"),
  outOfHoursMessage: text("outOfHoursMessage"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type BusinessHours = typeof businessHours.$inferSelect;
export type InsertBusinessHours = typeof businessHours.$inferInsert;

/**
 * ────────────────────────────────────────────────────────────
 * HANDOFF KEYWORDS — palavras-chave que disparam o handoff humano
 * ────────────────────────────────────────────────────────────
 */
export const handoffKeywords = mysqlTable(
  "handoff_keywords",
  {
    id: int("id").autoincrement().primaryKey(),
    agentId: int("agentId").notNull(),
    keyword: varchar("keyword", { length: 200 }).notNull(),
    notifyMessage: text("notifyMessage"), // mensagem enviada ao lead avisando
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    agentIdx: index("handoff_agent_idx").on(table.agentId),
  })
);
export type HandoffKeyword = typeof handoffKeywords.$inferSelect;
export type InsertHandoffKeyword = typeof handoffKeywords.$inferInsert;

/**
 * ────────────────────────────────────────────────────────────
 * METRICS EVENTS — eventos brutos para o dashboard
 * ────────────────────────────────────────────────────────────
 */
export const metricsEvents = mysqlTable(
  "metrics_events",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    agentId: int("agentId").notNull(),
    conversationId: int("conversationId"),
    eventType: varchar("eventType", { length: 80 }).notNull(),
    // Ex.: response_time_ms, tokens_used
    valueNumber: int("valueNumber"),
    metadata: json("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    agentTypeIdx: index("metrics_agent_type_idx").on(table.agentId, table.eventType, table.createdAt),
  })
);
export type MetricsEvent = typeof metricsEvents.$inferSelect;
export type InsertMetricsEvent = typeof metricsEvents.$inferInsert;

/**
 * ────────────────────────────────────────────────────────────
 * QR SESSIONS — estado de autenticação Baileys (modo não oficial)
 * Um por agente.
 * ────────────────────────────────────────────────────────────
 */
export const qrSessions = mysqlTable("qr_sessions", {
  id: int("id").autoincrement().primaryKey(),
  agentId: int("agentId").notNull().unique(),
  status: mysqlEnum("status", [
    "disconnected",
    "connecting",
    "awaiting_qr",
    "connected",
    "logged_out",
    "banned",
  ])
    .default("disconnected")
    .notNull(),
  // Diretório onde o multi-file auth state é persistido em disco
  authDir: varchar("authDir", { length: 500 }),
  // Cópia compactada (JSON base64) das credenciais Baileys, persistida em DB.
  // Sobrevive a restarts do container quando o filesystem é efêmero.
  authBlob: text("authBlob"),
  // QR code mais recente (data URL PNG base64) — limpo quando conecta
  lastQr: text("lastQr"),
  // JID do número conectado (ex: 5511999999999@s.whatsapp.net)
  jid: varchar("jid", { length: 120 }),
  // Nome exibido pela conta WhatsApp conectada
  displayName: varchar("displayName", { length: 200 }),
  lastConnectedAt: timestamp("lastConnectedAt"),
  lastError: text("lastError"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type QrSession = typeof qrSessions.$inferSelect;
export type InsertQrSession = typeof qrSessions.$inferInsert;


/**
 * ────────────────────────────────────────────────────────────
 * LLM PRICES — tabela editável de preços por modelo (USD por 1M tokens)
 * ────────────────────────────────────────────────────────────
 */
export const llmPrices = mysqlTable("llm_prices", {
  id: int("id").autoincrement().primaryKey(),
  model: varchar("model", { length: 120 }).notNull().unique(),
  // Preço por 1.000.000 tokens, em micro-USD (USD * 1_000_000) para precisão
  inputPer1M: int("inputPer1M").notNull(),
  outputPer1M: int("outputPer1M").notNull(),
  notes: varchar("notes", { length: 250 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type LlmPrice = typeof llmPrices.$inferSelect;
export type InsertLlmPrice = typeof llmPrices.$inferInsert;

/**
 * ────────────────────────────────────────────────────────────
 * LLM USAGE — uma linha por chamada de LLM, com tokens e custo calculado
 * ────────────────────────────────────────────────────────────
 */
export const llmUsage = mysqlTable(
  "llm_usage",
  {
    id: int("id").autoincrement().primaryKey(),
    agentId: int("agentId"),
    conversationId: int("conversationId"),
    leadId: int("leadId"),
    model: varchar("model", { length: 120 }).notNull(),
    purpose: varchar("purpose", { length: 60 }).notNull(), // orchestrator|qualifier|followup|simulator|other
    promptTokens: int("promptTokens").notNull().default(0),
    completionTokens: int("completionTokens").notNull().default(0),
    totalTokens: int("totalTokens").notNull().default(0),
    // Custo em micro-USD (USD * 1_000_000) para precisão
    costMicroUsd: int("costMicroUsd").notNull().default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    agentDateIdx: index("usage_agent_date_idx").on(table.agentId, table.createdAt),
    leadIdx: index("usage_lead_idx").on(table.leadId),
    conversationIdx: index("usage_conv_idx").on(table.conversationId),
    modelIdx: index("usage_model_idx").on(table.model),
  })
);
export type LlmUsage = typeof llmUsage.$inferSelect;
export type InsertLlmUsage = typeof llmUsage.$inferInsert;

/**
 * ────────────────────────────────────────────────────────────
 * COST EXTRAS — outras taxas operacionais lançadas manualmente pelo usuário
 * (ex: WABA, BSP, hospedagem). Somadas no total da aba Custos.
 * ────────────────────────────────────────────────────────────
 */
export const costExtras = mysqlTable("cost_extras", {
  id: int("id").autoincrement().primaryKey(),
  agentId: int("agentId"),
  label: varchar("label", { length: 200 }).notNull(),
  // Valor em micro-USD (USD * 1_000_000)
  amountMicroUsd: int("amountMicroUsd").notNull(),
  // Periodicidade: 'one_time' | 'monthly'
  period: mysqlEnum("period", ["one_time", "monthly"]).default("monthly").notNull(),
  occurredOn: timestamp("occurredOn").defaultNow().notNull(),
  notes: varchar("notes", { length: 300 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CostExtra = typeof costExtras.$inferSelect;
export type InsertCostExtra = typeof costExtras.$inferInsert;


/**
 * ────────────────────────────────────────────────────────────
 * RESTRICTED TERMS — termos/expressões que o agente NÃO pode usar.
 * Validados após a geração da resposta.
 * ────────────────────────────────────────────────────────────
 */
export const restrictedTerms = mysqlTable(
  "restricted_terms",
  {
    id: int("id").autoincrement().primaryKey(),
    agentId: int("agentId").notNull(),
    term: varchar("term", { length: 200 }).notNull(),
    // Ação: bloquear (regenerar) ou apenas remover/reescrever
    action: mysqlEnum("action", ["block", "rewrite"]).default("block").notNull(),
    notes: varchar("notes", { length: 300 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    agentIdx: index("restricted_agent_idx").on(table.agentId),
  })
);
export type RestrictedTerm = typeof restrictedTerms.$inferSelect;
export type InsertRestrictedTerm = typeof restrictedTerms.$inferInsert;

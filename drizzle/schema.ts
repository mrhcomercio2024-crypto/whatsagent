import {
  bigint,
  boolean,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  longtext,
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
  // Hash bcrypt da senha (apenas usuários criados via admin com senha própria).
  // Para contas legacy OAuth (owner) este campo é null.
  passwordHash: varchar("passwordHash", { length: 100 }),
  passwordUpdatedAt: timestamp("passwordUpdatedAt"),
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
  connectionMode: mysqlEnum("connectionMode", ["official", "qr", "zapi"]).default("official").notNull(),

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

  // — Perfil de tom (estilo de escrita) —
  // 'rigid' — corporativo, não usa gírias nem contrações
  // 'balanced' — padrão, profissional mas amigável
  // 'natural' — conversacional brasileiro (estilo Jac/WeDrop): "cê", "rapidinho", "tipo", "se liga"
  // 'custom' — usa íntegra do `agent_brain.tone`
  toneProfile: mysqlEnum("toneProfile", ["rigid", "balanced", "natural", "custom"]).default("balanced").notNull(),
  // Política de emojis: 'none' nunca, 'sparse' max 1 a cada 2-3 mensagens, 'rich' livre (max 3 por msg)
  emojiPolicy: mysqlEnum("emojiPolicy", ["none", "sparse", "rich"]).default("sparse").notNull(),
  // Frequência (0-100%) de uso do nome do lead nas mensagens. 30 = leve.
  useLeadNamePct: int("useLeadNamePct").default(30).notNull(),

  // — Memória evolutiva da conversa (resumo) —
  // A cada quantas mensagens o resumidor é acionado.
  summaryEveryN: int("summaryEveryN").default(6).notNull(),
  // Modelo LLM usado pelo resumidor; quando null, usa `defaultLlmModel`.
  summaryLlmModel: varchar("summaryLlmModel", { length: 80 }),

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
    // Limite de mensagens da IA nesta etapa antes de avançar automaticamente.
    // null/0 = sem limite. Quando atingido, o orchestrator avança para a próxima etapa.
    maxMessages: int("maxMessages"),
    // Anti-aluc.: objetivo único da etapa em 1 frase. Injeção no prompt e no validador stepCompliance.
    objective: varchar("objective", { length: 300 }),
    // Anti-aluc.: JSON array de perguntas obrigatórias antes de avançar.
    mustAsk: text("mustAsk"),
    // Anti-aluc.: JSON array de frases proibidas neste step.
    mustNotSay: text("mustNotSay"),
    // Anti-aluc.: JSON array de regex/keywords que indicam que o objetivo foi atingido.
    successSignals: text("successSignals"),
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
    // Propósito (agrupamento): prova_social, explicacao_produto, combate_objecao, bonus, garantia, apresentacao, outro
    purpose: varchar("purpose", { length: 40 }).default("outro"),
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
    triggerType: mysqlEnum("triggerType", ["keyword", "step", "ai_decision", "intent"]).notNull(),
    // Para keyword: lista CSV de palavras-chave (ex.: "preço,valor,quanto custa")
    keywords: varchar("keywords", { length: 500 }),
    // Para step: id da etapa em que deve ser enviada
    stepId: int("stepId"),
    // Para intent: rótulo curto da intenção (ex.: "duvida_preco", "quer_ver_resultado")
    intentLabel: varchar("intentLabel", { length: 80 }),
    // Descrição em linguagem natural do que configura essa intenção (usada no classificador LLM)
    intentDescription: text("intentDescription"),
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
    // Status automático detectado pela IA (slug de uma lead_status_rule). Quando a regra
    // correspondente tem isBlocking=true, o orchestrator trava o atendimento e envia replyWhenBlocked.
    statusTag: varchar("statusTag", { length: 80 }),
    statusTagSetAt: timestamp("statusTagSetAt"),
    // Indica se phoneNumber é um LID (@lid) do WhatsApp em vez de um número real.
    // Quando true, o dispatcher envia para `<id>@lid` em vez de `<id>@s.whatsapp.net`.
    isLid: boolean("isLid").default(false).notNull(),
    // Anti-aluc.: fatos estruturados extraídos pelo agente. Ex.: { ja_vende: true, marketplace: "shopee" }.
    facts: json("facts"),
    factsUpdatedAt: timestamp("factsUpdatedAt"),
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
    channel: mysqlEnum("channel", ["whatsapp", "instagram", "web"])
      .default("whatsapp")
      .notNull(),
    channelMetadata: json("channelMetadata"),
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
    // Mídia aguardando reação (ID da última mídia enviada quando queremos observar a reação do lead)
    awaitingReactionMediaId: int("awaitingReactionMediaId"),
    awaitingReactionSentAt: timestamp("awaitingReactionSentAt"),
    // Classificação da última reação do lead à mídia: 'positive'|'neutral'|'negative'|'ignored'
    lastMediaReaction: varchar("lastMediaReaction", { length: 16 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    agentLeadUnique: uniqueIndex("conv_agent_lead_unique").on(
      table.agentId,
      table.leadId,
      table.channel,
    ),
    agentChannelIdx: index("conv_agent_channel_idx").on(table.agentId, table.channel, table.lastMessageAt),
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
    channel: mysqlEnum("channel", ["whatsapp", "instagram", "web"])
      .default("whatsapp")
      .notNull(),
    direction: mysqlEnum("direction", ["inbound", "outbound"]).notNull(),
    sender: mysqlEnum("sender", ["lead", "ai", "human", "system"]).notNull(),
    contentType: mysqlEnum("contentType", ["text", "image", "video", "audio", "document", "template"])
      .default("text")
      .notNull(),
    body: text("body"), // texto ou caption
    mediaUrl: varchar("mediaUrl", { length: 500 }),
    mediaId: int("mediaId"), // referência ao media_assets se aplicável
    templateName: varchar("templateName", { length: 200 }),
    providerMessageId: varchar("providerMessageId", { length: 240 }),
    providerStatus: varchar("providerStatus", { length: 40 }),
    waMessageId: varchar("waMessageId", { length: 200 }), // id do WhatsApp
    waStatus: mysqlEnum("waStatus", ["queued", "sent", "delivered", "read", "failed"]),
    metadata: json("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    convIdx: index("msg_conv_idx").on(table.conversationId, table.createdAt),
    providerIdx: index("msg_provider_idx").on(table.channel, table.providerMessageId),
    providerUnique: uniqueIndex("msg_provider_unique").on(table.channel, table.providerMessageId),
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
    // Janela de horário permitido para o disparo (0..23). Se a hora atual
    // estiver fora da janela, o job é reagendado para o próximo allowedStartHour.
    // null = sem restrição.
    allowedStartHour: int("allowedStartHour"),
    allowedEndHour: int("allowedEndHour"),
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
 * ───────────────────────────────────────────────────────────────
 * LEAD STATUS RULES — tags automáticas de status do lead
 *
 * Quando o lead revela algo sobre sua situação ("já sou aluno", "já pedi reembolso",
 * "sou afiliado"), um classificador IA roda em paralelo à resposta normal e
 * atribui `lead.statusTag = slug`.
 *
 * Se `isBlocking=true`, o orchestrator no próximo turno NÃO chama o LLM
 * principal: envia `replyWhenBlocked` e pausa a IA (aiPaused=true).
 * ───────────────────────────────────────────────────────────────
 */
export const leadStatusRules = mysqlTable(
  "lead_status_rules",
  {
    id: int("id").autoincrement().primaryKey(),
    agentId: int("agentId").notNull(),
    // Slug curto, início estrito com letras (ex: "membro_wedrop", "afiliado")
    slug: varchar("slug", { length: 80 }).notNull(),
    // Nome legível exibido no painel
    label: varchar("label", { length: 120 }).notNull(),
    // Descrição usada pelo classificador IA para identificar esse status na fala do lead
    description: text("description").notNull(),
    // Se true, o orchestrator trava o atendimento ao detectar essa tag
    isBlocking: boolean("isBlocking").default(true).notNull(),
    // Mensagem padrão enviada ao lead quando esta tag bloqueante é atribuída
    replyWhenBlocked: text("replyWhenBlocked"),
    // Se true, faz handoff para humano (marca conversation.status = human_handoff)
    handoffOnMatch: boolean("handoffOnMatch").default(true).notNull(),
    // Se true, notifica o dono via notifyOwner
    notifyOwnerOnMatch: boolean("notifyOwnerOnMatch").default(true).notNull(),
    // Cor da badge na UI
    badgeColor: varchar("badgeColor", { length: 20 }).default("amber").notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    agentSlugUnique: uniqueIndex("lead_status_rules_agent_slug_unique").on(
      table.agentId,
      table.slug
    ),
  })
);
export type LeadStatusRule = typeof leadStatusRules.$inferSelect;
export type InsertLeadStatusRule = typeof leadStatusRules.$inferInsert;

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
/**
 * ─────────────────────────────────────────────────────────
 * Z-API INSTANCES — conexão não-oficial via Z-API (substitui Baileys)
 * O usuário cola Instance ID + Token (e opcionalmente Client-Token de segurança)
 * O sistema envia mensagens via REST e recebe inbound via webhook configurado no painel da Z-API.
 * ─────────────────────────────────────────────────────────
 */
export const zapiInstances = mysqlTable("zapi_instances", {
  id: int("id").autoincrement().primaryKey(),
  agentId: int("agentId").notNull().unique(),
  instanceId: varchar("instanceId", { length: 120 }).notNull(),
  token: varchar("token", { length: 200 }).notNull(),
  // Header opcional Client-Token (token de segurança da conta Z-API)
  clientToken: varchar("clientToken", { length: 200 }),
  // Webhook secret hex assinado em todo POST /api/zapi/:agentId/inbound
  webhookSecret: varchar("webhookSecret", { length: 80 }).notNull(),
  // Resultado do último health-check feito via GET /status
  isConnected: boolean("isConnected").default(false).notNull(),
  lastStatusCheckAt: timestamp("lastStatusCheckAt"),
  // Número do telefone conectado, retornado por GET /status
  connectedPhone: varchar("connectedPhone", { length: 40 }),
  lastError: text("lastError"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ZapiInstance = typeof zapiInstances.$inferSelect;
export type InsertZapiInstance = typeof zapiInstances.$inferInsert;

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
  // longtext (4GB) — text (64KB) estourava em sessões ativas com muitos preKeys
  authBlob: longtext("authBlob"),
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


/**
 * ────────────────────────────────────────────────────────────
 * EXTERNAL EVENT SOURCES — fontes externas (Hotmart, Shopify, Kiwify, etc.)
 * que enviam webhooks. Cada source tem slug único (entra na URL pública)
 * e um secret HMAC para validar assinatura.
 * ────────────────────────────────────────────────────────────
 */
export const externalEventSources = mysqlTable(
  "external_event_sources",
  {
    id: int("id").autoincrement().primaryKey(),
    agentId: int("agentId").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    // Slug único (entra na URL: /api/external-events/<slug>)
    slug: varchar("slug", { length: 80 }).notNull().unique(),
    // Secret usado para verificar HMAC SHA-256 do payload (header X-Signature).
    // Pode ser rotacionado pelo painel.
    secret: varchar("secret", { length: 128 }).notNull(),
    // Se false, ignora silenciosamente (status=ignored).
    enabled: boolean("enabled").default(true).notNull(),
    // Tipo de plataforma para hints/UX (free-form): hotmart, shopify, kiwify, custom...
    platform: varchar("platform", { length: 60 }).default("custom").notNull(),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    agentIdx: index("ext_src_agent_idx").on(table.agentId),
  })
);
export type ExternalEventSource = typeof externalEventSources.$inferSelect;
export type InsertExternalEventSource = typeof externalEventSources.$inferInsert;

/**
 * ────────────────────────────────────────────────────────────
 * EXTERNAL EVENTS — log de cada webhook recebido. Permite reprocessar.
 * ────────────────────────────────────────────────────────────
 */
export const externalEvents = mysqlTable(
  "external_events",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    sourceId: int("sourceId").notNull(),
    agentId: int("agentId").notNull(),
    // Tipo do evento: purchase.completed, cart.abandoned, checkout.started,
    // payment.refused, signup.completed, custom.*
    eventType: varchar("eventType", { length: 80 }).notNull(),
    // Identificador bruto (telefone OU email) extraído do payload
    leadIdentifier: varchar("leadIdentifier", { length: 320 }),
    leadId: int("leadId"),
    payload: json("payload").notNull(),
    // Status do processamento:
    //   received  - chegou
    //   matched   - lead identificado, regras encontradas
    //   unmatched - lead não encontrado
    //   processed - ações executadas
    //   ignored   - source desabilitado ou nenhuma regra
    //   failed    - erro durante execução
    status: mysqlEnum("status", [
      "received",
      "matched",
      "unmatched",
      "processed",
      "ignored",
      "failed",
    ])
      .default("received")
      .notNull(),
    actionsApplied: json("actionsApplied"),
    errorMessage: text("errorMessage"),
    receivedAt: timestamp("receivedAt").defaultNow().notNull(),
    processedAt: timestamp("processedAt"),
  },
  table => ({
    agentIdx: index("ext_evt_agent_idx").on(table.agentId, table.receivedAt),
    sourceIdx: index("ext_evt_source_idx").on(table.sourceId, table.receivedAt),
    typeIdx: index("ext_evt_type_idx").on(table.agentId, table.eventType),
  })
);
export type ExternalEvent = typeof externalEvents.$inferSelect;
export type InsertExternalEvent = typeof externalEvents.$inferInsert;

/**
 * ────────────────────────────────────────────────────────────
 * EXTERNAL EVENT RULES — para um agente, dado um eventType, define
 * a lista ordenada de ações a executar.
 *
 * `actions` é um array JSON: [{ kind: 'moveToStep', stepId }, ...]
 * Tipos suportados:
 *   - { kind: 'moveToStep', stepId: number }
 *   - { kind: 'setTemperature', temperature: 'cold'|'warm'|'hot' }
 *   - { kind: 'addTag', tag: string }
 *   - { kind: 'sendMessage', mode: 'free'|'fixed'|'template',
 *       text?: string, templateName?: string, prompt?: string,
 *       delayMinutes?: number }
 *   - { kind: 'pauseAi' } | { kind: 'resumeAi' }
 *   - { kind: 'handoff' }
 *   - { kind: 'notifyOwner', title?: string }
 *
 * ────────────────────────────────────────────────────────────
 */
export const externalEventRules = mysqlTable(
  "external_event_rules",
  {
    id: int("id").autoincrement().primaryKey(),
    agentId: int("agentId").notNull(),
    // null = aplica a TODAS as fontes do agente
    sourceId: int("sourceId"),
    eventType: varchar("eventType", { length: 80 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    description: text("description"),
    // Forma legada (multi-ações) — mantida para retrocompatibilidade.
    // O editor novo grava aqui um array único equivalente à execução.
    actions: json("actions").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    // Quando o lead não existe ainda, criar a partir do payload?
    createLeadIfMissing: boolean("createLeadIfMissing").default(true).notNull(),
    priority: int("priority").default(100).notNull(),
    // ───────── Campos do editor v2 (uma regra = uma execução) ─────────
    // Canal de WhatsApp (agente) que vai disparar o template. Quando null,
    // não envia template (apenas executa as outras ações).
    channelAgentId: int("channelAgentId"),
    // Template HSM (id de whatsapp_templates) a disparar.
    templateId: int("templateId"),
    // Atraso em minutos antes de executar (0 = imediato).
    delayMinutes: int("delayMinutes").default(0).notNull(),
    // Se preenchido, move o lead para este script_step após a execução.
    moveToStepId: int("moveToStepId"),
    // Se preenchido, anexa esta tag em leads.tags (CSV).
    tagLabel: varchar("tagLabel", { length: 80 }),
    // Texto que será entregue à IA como contexto no próximo prompt.
    aiContext: text("aiContext"),
    // Toggle de ativo do editor v2 (espelho de `enabled`, mantido por clareza
    // visual no card do mock). Quando false, a engine pula a regra.
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    agentTypeIdx: index("ext_rule_agent_type_idx").on(
      table.agentId,
      table.eventType,
      table.enabled
    ),
  })
);
export type ExternalEventRule = typeof externalEventRules.$inferSelect;
export type InsertExternalEventRule = typeof externalEventRules.$inferInsert;


/**
 * ────────────────────────────────────────────────────────────
 * Message retries — reenvio automático de mensagens que falharam
 *
 * Toda vez que `dispatchViaBaileys` (ou Cloud API) não consegue confirmar o
 * envio (timeout, exception, mídia ausente), uma linha é gravada aqui com o
 * payload completo para tentar de novo mais tarde. O `retryWorker` tica a
 * cada 10s, pega o que está vencido e reenvia respeitando rate limit.
 *
 * Cancelamento automático: se o lead respondeu DEPOIS do createdAt deste
 * retry, cancela com motivo `cancelled_by_reply` (não faz sentido mandar
 * follow-up depois da pessoa já ter retomado a conversa).
 * ────────────────────────────────────────────────────────────
 */
export const messageRetries = mysqlTable(
  "message_retries",
  {
    id: int("id").autoincrement().primaryKey(),
    agentId: int("agentId").notNull(),
    conversationId: int("conversationId").notNull(),
    leadId: int("leadId").notNull(),
    // Payload completo para refazer o envio: { type: "text"|"media", text?, mediaId?, jid }
    payload: json("payload").notNull(),
    sender: mysqlEnum("sender", ["ai", "operator", "system"]).notNull().default("ai"),
    attempt: int("attempt").notNull().default(0),
    maxAttempts: int("maxAttempts").notNull().default(5),
    nextRetryAt: timestamp("nextRetryAt").notNull(),
    status: mysqlEnum("status", [
      "pending",
      "succeeded",
      "exhausted",
      "cancelled",
      "cancelled_by_reply",
    ])
      .notNull()
      .default("pending"),
    lastError: text("lastError"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
  },
  table => ({
    statusIdx: index("idx_msg_retries_status").on(table.status, table.nextRetryAt),
    convIdx: index("idx_msg_retries_conv").on(table.conversationId),
    agentIdx: index("idx_msg_retries_agent").on(table.agentId, table.status),
  })
);
export type MessageRetry = typeof messageRetries.$inferSelect;
export type InsertMessageRetry = typeof messageRetries.$inferInsert;


/**
 * ────────────────────────────────────────────────────────────
 * OBJECTIONS — objeções estruturadas com gatilhos por keyword/regex,
 * resposta literal ou template, mídias associadas e ação de funil.
 * ────────────────────────────────────────────────────────────
 */
export const objections = mysqlTable(
  "objections",
  {
    id: int("id").autoincrement().primaryKey(),
    agentId: int("agentId").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description"),
    triggerKeywords: text("trigger_keywords").notNull(),
    triggerRegex: text("trigger_regex"),
    responseTemplate: text("response_template").notNull(),
    literalResponse: boolean("literal_response").default(false).notNull(),
    mediaIds: text("media_ids"),
    nextStepAction: mysqlEnum("next_step_action", ["stay", "advance", "restart"])
      .default("stay")
      .notNull(),
    priority: int("priority").default(100).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    sendOncePerConversation: boolean("send_once_per_conversation").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    agentIdx: index("objections_agent_idx").on(table.agentId, table.isActive, table.priority),
  })
);
export type Objection = typeof objections.$inferSelect;
export type InsertObjection = typeof objections.$inferInsert;

export const objectionDispatches = mysqlTable(
  "objection_dispatches",
  {
    id: int("id").autoincrement().primaryKey(),
    conversationId: int("conversationId").notNull(),
    objectionId: int("objectionId").notNull(),
    dispatchedAt: timestamp("dispatchedAt").defaultNow().notNull(),
  },
  table => ({
    convIdx: index("obj_disp_conv_idx").on(table.conversationId, table.objectionId),
  })
);
export type ObjectionDispatch = typeof objectionDispatches.$inferSelect;

/**
 * ────────────────────────────────────────────────────────────
 * STEP MEDIA LINKS — vincula mídias a etapas com regra de disparo
 * (on_enter, on_advance, on_demand) e posição (before/after/standalone).
 * ────────────────────────────────────────────────────────────
 */
export const stepMediaLinks = mysqlTable(
  "step_media_links",
  {
    id: int("id").autoincrement().primaryKey(),
    stepId: int("stepId").notNull(),
    mediaId: int("mediaId").notNull(),
    fireWhen: mysqlEnum("fire_when", ["on_enter", "on_advance", "on_demand"])
      .default("on_enter")
      .notNull(),
    delaySeconds: int("delay_seconds").default(0).notNull(),
    position: mysqlEnum("position", ["before_message", "after_message", "standalone"])
      .default("standalone")
      .notNull(),
    isActive: boolean("is_active").default(true).notNull(),
  },
  table => ({
    stepIdx: index("sml_step_idx").on(table.stepId, table.fireWhen, table.isActive),
  })
);
export type StepMediaLink = typeof stepMediaLinks.$inferSelect;
export type InsertStepMediaLink = typeof stepMediaLinks.$inferInsert;

/**
 * ────────────────────────────────────────────────────────────
 * STEP COMPLIANCE LOGS — auditoria de não cumprimento de step pelo agente.
 * ────────────────────────────────────────────────────────────
 */
export const stepComplianceLogs = mysqlTable(
  "step_compliance_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    conversationId: int("conversationId").notNull(),
    stepId: int("stepId").notNull(),
    aiResponse: text("ai_response").notNull(),
    passed: boolean("passed").notNull(),
    reason: varchar("reason", { length: 500 }),
    regenerated: boolean("regenerated").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    convIdx: index("scl_conv_idx").on(table.conversationId, table.createdAt),
  })
);
export type StepComplianceLog = typeof stepComplianceLogs.$inferSelect;
export type InsertStepComplianceLog = typeof stepComplianceLogs.$inferInsert;

/**
 * ────────────────────────────────────────────────────────────
 * PUBLIC SIMULATOR CONFIG — configuração pública e visual do
 * SIMULADOR WHATSAPP. Há uma configuração por agente e um slug
 * público único (ex.: /simulador/ravi).
 * ────────────────────────────────────────────────────────────
 */
export const publicSimulatorConfigs = mysqlTable(
  "public_simulator_configs",
  {
    id: int("id").autoincrement().primaryKey(),
    agentId: int("agentId").notNull().unique(),
    slug: varchar("slug", { length: 100 }).notNull().unique(),
    enabled: boolean("enabled").default(true).notNull(),
    webMode: mysqlEnum("webMode", ["lite", "advanced"]).default("lite").notNull(),
    displayName: varchar("displayName", { length: 120 }).default("RAVI").notNull(),
    statusText: varchar("statusText", { length: 120 }).default("online").notNull(),
    avatarUrl: varchar("avatarUrl", { length: 500 }),
    accentColor: varchar("accentColor", { length: 20 }).default("#00a884").notNull(),
    welcomeMessage: text("welcomeMessage").notNull(),
    startButtonText: varchar("startButtonText", { length: 120 })
      .default("SIM, QUERO SABER")
      .notNull(),
    startLeadMessage: varchar("startLeadMessage", { length: 240 })
      .default("Sim, quero saber como funciona.")
      .notNull(),
    inputPlaceholder: varchar("inputPlaceholder", { length: 160 })
      .default("Digite uma mensagem")
      .notNull(),
    checkoutUrl: varchar("checkoutUrl", { length: 1000 }),
    checkoutButtonText: varchar("checkoutButtonText", { length: 160 })
      .default("ABRIR CHECKOUT")
      .notNull(),
    webhookSecret: varchar("webhookSecret", { length: 128 }).notNull(),
    purchaseEventNames: json("purchaseEventNames"),
    checkoutRequestPatterns: json("checkoutRequestPatterns"),
    // Recuperação multicanal — Web Push é o primeiro canal ativo.
    pushEnabled: boolean("pushEnabled").default(false).notNull(),
    pushConsentEnabled: boolean("pushConsentEnabled").default(true).notNull(),
    pushConsentMinInteractions: int("pushConsentMinInteractions").default(4).notNull(),
    pushInterestScoreThreshold: int("pushInterestScoreThreshold").default(40).notNull(),
    pushStrongInterestScore: int("pushStrongInterestScore").default(65).notNull(),
    pushConsentMessage: text("pushConsentMessage"),
    pushConsentButtonText: varchar("pushConsentButtonText", { length: 160 })
      .default("SIM, QUERO QUE O RAVI ME AVISE")
      .notNull(),
    pushGlobalCooldownMinutes: int("pushGlobalCooldownMinutes").default(180).notNull(),
    pushMaxPerSequence: int("pushMaxPerSequence").default(3).notNull(),
    pushAttributionWindowHours: int("pushAttributionWindowHours").default(168).notNull(),
    pushAiPersonalizationEnabled: boolean("pushAiPersonalizationEnabled")
      .default(true)
      .notNull(),
    recoveryCronTaskUid: varchar("recoveryCronTaskUid", { length: 65 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    agentIdx: index("pub_sim_cfg_agent_idx").on(table.agentId),
    recoveryCronIdx: index("pub_sim_cfg_recovery_cron_idx").on(table.recoveryCronTaskUid),
    slugIdx: index("pub_sim_cfg_slug_idx").on(table.slug),
  })
);
export type PublicSimulatorConfig = typeof publicSimulatorConfigs.$inferSelect;
export type InsertPublicSimulatorConfig = typeof publicSimulatorConfigs.$inferInsert;

/**
 * ────────────────────────────────────────────────────────────
 * PUBLIC SIMULATOR SESSIONS — uma conversa pública por visitante.
 * O browser recebe publicId + token aleatório; somente o hash do
 * token fica persistido. A conversa em si reutiliza leads,
 * conversations e messages para passar pelo cérebro real.
 * ────────────────────────────────────────────────────────────
 */
export const publicSimulatorSessions = mysqlTable(
  "public_simulator_sessions",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    publicId: varchar("publicId", { length: 64 }).notNull().unique(),
    accessTokenHash: varchar("accessTokenHash", { length: 128 }).notNull(),
    configId: int("configId").notNull(),
    agentId: int("agentId").notNull(),
    leadId: int("leadId").notNull(),
    conversationId: int("conversationId").notNull(),
    status: mysqlEnum("status", ["waiting", "active", "completed", "converted", "archived"])
      .default("waiting")
      .notNull(),
    startedAt: timestamp("startedAt"),
    lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
    capturedName: varchar("capturedName", { length: 200 }),
    capturedPhone: varchar("capturedPhone", { length: 40 }),
    capturedEmail: varchar("capturedEmail", { length: 320 }),
    utmSource: varchar("utmSource", { length: 160 }),
    utmMedium: varchar("utmMedium", { length: 160 }),
    utmCampaign: varchar("utmCampaign", { length: 240 }),
    utmContent: varchar("utmContent", { length: 240 }),
    utmTerm: varchar("utmTerm", { length: 240 }),
    gclid: varchar("gclid", { length: 240 }),
    fbclid: varchar("fbclid", { length: 240 }),
    referrer: varchar("referrer", { length: 1000 }),
    landingUrl: varchar("landingUrl", { length: 1500 }),
    userAgent: varchar("userAgent", { length: 1000 }),
    ipHash: varchar("ipHash", { length: 128 }),
    checkoutRequestedAt: timestamp("checkoutRequestedAt"),
    checkoutLinkSentAt: timestamp("checkoutLinkSentAt"),
    checkoutClickedAt: timestamp("checkoutClickedAt"),
    purchasedAt: timestamp("purchasedAt"),
    purchaseEventId: varchar("purchaseEventId", { length: 180 }),
    orderId: varchar("orderId", { length: 180 }),
    amountCents: int("amountCents"),
    currency: varchar("currency", { length: 12 }).default("BRL"),
    leadScore: int("leadScore").default(0).notNull(),
    interestSignals: json("interestSignals"),
    pushConsentOfferedAt: timestamp("pushConsentOfferedAt"),
    pushConsentGrantedAt: timestamp("pushConsentGrantedAt"),
    pushConsentDeclinedAt: timestamp("pushConsentDeclinedAt"),
    pushOptedOutAt: timestamp("pushOptedOutAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    agentIdx: index("pub_sim_session_agent_idx").on(table.agentId, table.createdAt),
    configIdx: index("pub_sim_session_config_idx").on(table.configId, table.createdAt),
    conversationIdx: uniqueIndex("pub_sim_session_conv_unique").on(table.conversationId),
    phoneIdx: index("pub_sim_session_phone_idx").on(table.capturedPhone),
    emailIdx: index("pub_sim_session_email_idx").on(table.capturedEmail),
    statusIdx: index("pub_sim_session_status_idx").on(table.agentId, table.status),
  })
);
export type PublicSimulatorSession = typeof publicSimulatorSessions.$inferSelect;
export type InsertPublicSimulatorSession = typeof publicSimulatorSessions.$inferInsert;

/**
 * Idempotência dos envios públicos. Evita mensagem/resposta duplicada
 * por duplo clique, retry do browser ou timeout da rede.
 */
export const publicSimulatorRequests = mysqlTable(
  "public_simulator_requests",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    sessionId: bigint("sessionId", { mode: "number" }).notNull(),
    requestId: varchar("requestId", { length: 80 }).notNull(),
    kind: mysqlEnum("kind", ["start", "text", "audio"]).notNull(),
    status: mysqlEnum("status", ["processing", "completed", "failed", "expired"])
      .default("processing")
      .notNull(),
    response: json("response"),
    errorMessage: text("errorMessage"),
    expiresAt: timestamp("expiresAt"),
    lastRecoveryAt: timestamp("lastRecoveryAt"),
    recoveryAttempts: int("recoveryAttempts").default(0).notNull(),
    lastHttpStatus: int("lastHttpStatus"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
  },
  table => ({
    sessionIdx: index("pub_sim_req_session_idx").on(table.sessionId, table.createdAt),
    sessionRequestUnique: uniqueIndex("pub_sim_req_session_request_unique").on(
      table.sessionId,
      table.requestId,
    ),
    requestIdx: index("pub_sim_req_request_idx").on(table.requestId),
  })
);
export type PublicSimulatorRequest = typeof publicSimulatorRequests.$inferSelect;
export type InsertPublicSimulatorRequest = typeof publicSimulatorRequests.$inferInsert;

/**
 * Eventos de conversão do simulador: pedido de link, envio do link,
 * clique e compra confirmada pelo webhook Looma/Pagar.me.
 */
export const publicSimulatorConversions = mysqlTable(
  "public_simulator_conversions",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    sessionId: bigint("sessionId", { mode: "number" }).notNull(),
    agentId: int("agentId").notNull(),
    eventId: varchar("eventId", { length: 180 }).notNull().unique(),
    eventType: mysqlEnum("eventType", [
      "checkout_requested",
      "checkout_link_sent",
      "checkout_clicked",
      "purchase_paid",
      "purchase_failed",
      "purchase_refunded",
    ]).notNull(),
    orderId: varchar("orderId", { length: 180 }),
    amountCents: int("amountCents"),
    currency: varchar("currency", { length: 12 }).default("BRL"),
    payload: json("payload"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    sessionIdx: index("pub_sim_conv_session_idx").on(table.sessionId, table.createdAt),
    agentIdx: index("pub_sim_conv_agent_idx").on(table.agentId, table.eventType, table.createdAt),
    orderIdx: index("pub_sim_conv_order_idx").on(table.orderId),
  })
);
export type PublicSimulatorConversion = typeof publicSimulatorConversions.$inferSelect;
export type InsertPublicSimulatorConversion = typeof publicSimulatorConversions.$inferInsert;

/**
 * Assinaturas Web Push do Ravi Web. Endpoint e chaves são armazenados
 * cifrados; endpointHash existe apenas para deduplicação e lookup seguro.
 */
export const publicPushSubscriptions = mysqlTable(
  "public_push_subscriptions",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    configId: int("configId").notNull(),
    agentId: int("agentId").notNull(),
    sessionId: bigint("sessionId", { mode: "number" }).notNull(),
    leadId: int("leadId").notNull(),
    conversationId: int("conversationId").notNull(),
    endpointHash: varchar("endpointHash", { length: 64 }).notNull().unique(),
    endpointCiphertext: longtext("endpointCiphertext").notNull(),
    p256dhCiphertext: text("p256dhCiphertext").notNull(),
    authCiphertext: text("authCiphertext").notNull(),
    permissionStatus: mysqlEnum("permissionStatus", ["default", "granted", "denied"])
      .default("granted")
      .notNull(),
    browser: varchar("browser", { length: 80 }),
    device: varchar("device", { length: 80 }),
    userAgent: varchar("userAgent", { length: 1000 }),
    active: boolean("active").default(true).notNull(),
    lastPushAt: timestamp("lastPushAt"),
    failureCount: int("failureCount").default(0).notNull(),
    invalidatedAt: timestamp("invalidatedAt"),
    revokedAt: timestamp("revokedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    sessionIdx: index("pub_push_sub_session_idx").on(table.sessionId, table.active),
    conversationIdx: index("pub_push_sub_conv_idx").on(table.conversationId, table.active),
    agentIdx: index("pub_push_sub_agent_idx").on(table.agentId, table.active),
  })
);
export type PublicPushSubscription = typeof publicPushSubscriptions.$inferSelect;
export type InsertPublicPushSubscription = typeof publicPushSubscriptions.$inferInsert;

/**
 * Regras genéricas de recuperação. A coluna channel já reserva os canais
 * futuros sem acoplar o motor ao Web Push.
 */
export const recoveryRules = mysqlTable(
  "recovery_rules",
  {
    id: int("id").autoincrement().primaryKey(),
    configId: int("configId").notNull(),
    agentId: int("agentId").notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    channel: mysqlEnum("channel", ["push", "email", "instagram", "whatsapp"])
      .default("push")
      .notNull(),
    triggerType: mysqlEnum("triggerType", ["user_inactive"]).default("user_inactive").notNull(),
    sequenceOrder: int("sequenceOrder").default(0).notNull(),
    delayMinutes: int("delayMinutes").notNull(),
    eligibleStages: json("eligibleStages"),
    eligibleTemperatures: json("eligibleTemperatures"),
    minLeadScore: int("minLeadScore").default(0).notNull(),
    requireInterest: boolean("requireInterest").default(true).notNull(),
    messageTemplate: text("messageTemplate").notNull(),
    aiPersonalizationEnabled: boolean("aiPersonalizationEnabled").default(false).notNull(),
    aiPrompt: text("aiPrompt"),
    attributionWindowHours: int("attributionWindowHours").default(168).notNull(),
    maxAttempts: int("maxAttempts").default(1).notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    configIdx: index("recovery_rule_config_idx").on(
      table.configId,
      table.channel,
      table.isActive,
      table.sequenceOrder
    ),
    agentIdx: index("recovery_rule_agent_idx").on(table.agentId),
  })
);
export type RecoveryRule = typeof recoveryRules.$inferSelect;
export type InsertRecoveryRule = typeof recoveryRules.$inferInsert;

/** Fila persistente e idempotente de todos os canais de recuperação. */
export const recoveryJobs = mysqlTable(
  "recovery_jobs",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    pushId: varchar("pushId", { length: 64 }).notNull().unique(),
    idempotencyKey: varchar("idempotencyKey", { length: 180 }).notNull().unique(),
    ruleId: int("ruleId").notNull(),
    configId: int("configId").notNull(),
    agentId: int("agentId").notNull(),
    sessionId: bigint("sessionId", { mode: "number" }).notNull(),
    leadId: int("leadId").notNull(),
    conversationId: int("conversationId").notNull(),
    subscriptionId: bigint("subscriptionId", { mode: "number" }),
    channel: mysqlEnum("channel", ["push", "email", "instagram", "whatsapp"])
      .default("push")
      .notNull(),
    sequenceKey: varchar("sequenceKey", { length: 100 }).notNull(),
    status: mysqlEnum("status", [
      "pending",
      "processing",
      "sent",
      "cancelled",
      "failed",
      "expired",
    ]).default("pending").notNull(),
    sequenceOrder: int("sequenceOrder").default(0).notNull(),
    scheduledAt: timestamp("scheduledAt").notNull(),
    lockedAt: timestamp("lockedAt"),
    sentAt: timestamp("sentAt"),
    deliveredAt: timestamp("deliveredAt"),
    clickedAt: timestamp("clickedAt"),
    returnedAt: timestamp("returnedAt"),
    checkoutAfterPushAt: timestamp("checkoutAfterPushAt"),
    purchaseAfterPushAt: timestamp("purchaseAfterPushAt"),
    revenueAfterPushCents: int("revenueAfterPushCents"),
    attributionWindowHours: int("attributionWindowHours").default(168).notNull(),
    attributionExpiresAt: timestamp("attributionExpiresAt"),
    attemptCount: int("attemptCount").default(0).notNull(),
    maxAttempts: int("maxAttempts").default(1).notNull(),
    payload: json("payload"),
    lastError: text("lastError"),
    cancelReason: varchar("cancelReason", { length: 120 }),
    cancelledAt: timestamp("cancelledAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    dueIdx: index("recovery_job_due_idx").on(table.status, table.channel, table.scheduledAt),
    sessionIdx: index("recovery_job_session_idx").on(table.sessionId, table.status),
    sequenceIdx: index("recovery_job_sequence_idx").on(table.sessionId, table.sequenceKey, table.status),
    attributionIdx: index("recovery_job_attr_idx").on(table.sessionId, table.sentAt),
    ruleIdx: index("recovery_job_rule_idx").on(table.ruleId, table.status),
  })
);
export type RecoveryJob = typeof recoveryJobs.$inferSelect;
export type InsertRecoveryJob = typeof recoveryJobs.$inferInsert;

/** Linha do tempo auditável de cada recuperação e de sua receita atribuída. */
export const recoveryEvents = mysqlTable(
  "recovery_events",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    eventId: varchar("eventId", { length: 80 }).notNull().unique(),
    pushId: varchar("pushId", { length: 64 }).notNull(),
    jobId: bigint("jobId", { mode: "number" }).notNull(),
    ruleId: int("ruleId").notNull(),
    sessionId: bigint("sessionId", { mode: "number" }).notNull(),
    agentId: int("agentId").notNull(),
    channel: mysqlEnum("channel", ["push", "email", "instagram", "whatsapp"])
      .default("push")
      .notNull(),
    eventType: mysqlEnum("eventType", [
      "queued",
      "sent",
      "delivered",
      "clicked",
      "returned",
      "checkout_after_push",
      "purchase_after_push",
      "failed",
      "cancelled",
      "subscription_invalid",
    ]).notNull(),
    revenueCents: int("revenueCents"),
    attributionWindowHours: int("attributionWindowHours"),
    payload: json("payload"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    pushIdx: index("recovery_event_push_idx").on(table.pushId, table.createdAt),
    ruleIdx: index("recovery_event_rule_idx").on(table.ruleId, table.eventType),
    sessionIdx: index("recovery_event_session_idx").on(table.sessionId, table.createdAt),
  })
);
export type RecoveryEvent = typeof recoveryEvents.$inferSelect;
export type InsertRecoveryEvent = typeof recoveryEvents.$inferInsert;

/** Configuração de uma conta profissional Instagram por agente. */
export const instagramIntegrations = mysqlTable(
  "instagram_integrations",
  {
    id: int("id").autoincrement().primaryKey(),
    agentId: int("agentId").notNull().unique(),
    metaAppId: varchar("metaAppId", { length: 64 }).notNull(),
    instagramAccountId: varchar("instagramAccountId", { length: 80 }),
    username: varchar("username", { length: 160 }),
    accountName: varchar("accountName", { length: 200 }),
    profilePictureUrl: varchar("profilePictureUrl", { length: 1000 }),
    accessTokenEncrypted: longtext("accessTokenEncrypted"),
    tokenExpiresAt: timestamp("tokenExpiresAt"),
    tokenStatus: mysqlEnum("tokenStatus", ["missing", "valid", "expired", "revoked", "error"])
      .default("missing")
      .notNull(),
    scopes: json("scopes"),
    webhookStatus: mysqlEnum("webhookStatus", ["pending", "verified", "subscribed", "error"])
      .default("pending")
      .notNull(),
    webhookVerifiedAt: timestamp("webhookVerifiedAt"),
    webhookSubscribedAt: timestamp("webhookSubscribedAt"),
    lastWebhookAt: timestamp("lastWebhookAt"),
    lastInboundAt: timestamp("lastInboundAt"),
    lastOutboundAt: timestamp("lastOutboundAt"),
    lastSyncAt: timestamp("lastSyncAt"),
    lastError: text("lastError"),
    lastErrorCode: varchar("lastErrorCode", { length: 80 }),
    lastErrorSubcode: varchar("lastErrorSubcode", { length: 80 }),
    lastErrorAt: timestamp("lastErrorAt"),
    isConnected: boolean("isConnected").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    accountIdx: uniqueIndex("instagram_integration_account_unique").on(table.instagramAccountId),
  }),
);
export type InstagramIntegration = typeof instagramIntegrations.$inferSelect;
export type InsertInstagramIntegration = typeof instagramIntegrations.$inferInsert;

/** Identidades externas por canal ligadas ao mesmo lead do CRM. */
export const channelIdentities = mysqlTable(
  "channel_identities",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    agentId: int("agentId").notNull(),
    leadId: int("leadId").notNull(),
    channel: mysqlEnum("channel", ["whatsapp", "instagram", "web"]).notNull(),
    accountId: varchar("accountId", { length: 100 }).notNull(),
    externalUserId: varchar("externalUserId", { length: 200 }).notNull(),
    username: varchar("username", { length: 160 }),
    displayName: varchar("displayName", { length: 200 }),
    profilePictureUrl: varchar("profilePictureUrl", { length: 1000 }),
    metadata: json("metadata"),
    lastSeenAt: timestamp("lastSeenAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    externalUnique: uniqueIndex("channel_identity_external_unique").on(
      table.agentId,
      table.channel,
      table.accountId,
      table.externalUserId,
    ),
    leadIdx: index("channel_identity_lead_idx").on(table.leadId, table.channel),
  }),
);
export type ChannelIdentity = typeof channelIdentities.$inferSelect;
export type InsertChannelIdentity = typeof channelIdentities.$inferInsert;

/** Nonces one-time do OAuth Instagram, armazenados apenas como hash. */
export const instagramOauthStates = mysqlTable(
  "instagram_oauth_states",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    stateHash: varchar("stateHash", { length: 64 }).notNull().unique(),
    agentId: int("agentId").notNull(),
    userId: int("userId").notNull(),
    redirectOrigin: varchar("redirectOrigin", { length: 500 }).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    consumedAt: timestamp("consumedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    expiryIdx: index("instagram_oauth_state_expiry_idx").on(table.expiresAt, table.consumedAt),
  }),
);
export type InstagramOauthState = typeof instagramOauthStates.$inferSelect;
export type InsertInstagramOauthState = typeof instagramOauthStates.$inferInsert;

/** Eventos recebidos da Meta; eventKey garante idempotência persistente. */
export const instagramWebhookEvents = mysqlTable(
  "instagram_webhook_events",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    integrationId: int("integrationId"),
    agentId: int("agentId"),
    eventKey: varchar("eventKey", { length: 240 }).notNull().unique(),
    eventType: varchar("eventType", { length: 80 }).notNull(),
    providerMessageId: varchar("providerMessageId", { length: 240 }),
    instagramAccountId: varchar("instagramAccountId", { length: 80 }),
    igsid: varchar("igsid", { length: 200 }),
    payload: json("payload").notNull(),
    status: mysqlEnum("status", ["received", "ignored", "processing", "processed", "failed"])
      .default("received")
      .notNull(),
    attemptCount: int("attemptCount").default(0).notNull(),
    httpStatus: int("httpStatus"),
    metaErrorCode: varchar("metaErrorCode", { length: 80 }),
    metaErrorSubcode: varchar("metaErrorSubcode", { length: 80 }),
    errorMessage: text("errorMessage"),
    receivedAt: timestamp("receivedAt").defaultNow().notNull(),
    processedAt: timestamp("processedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    agentStatusIdx: index("instagram_event_agent_status_idx").on(table.agentId, table.status, table.receivedAt),
    accountIdx: index("instagram_event_account_idx").on(table.instagramAccountId, table.receivedAt),
  }),
);
export type InstagramWebhookEvent = typeof instagramWebhookEvents.$inferSelect;
export type InsertInstagramWebhookEvent = typeof instagramWebhookEvents.$inferInsert;

/** Log operacional estruturado e sanitizado do canal Instagram. */
export const instagramLogs = mysqlTable(
  "instagram_logs",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    agentId: int("agentId"),
    integrationId: int("integrationId"),
    conversationId: int("conversationId"),
    leadId: int("leadId"),
    eventType: varchar("eventType", { length: 100 }).notNull(),
    level: mysqlEnum("level", ["info", "warning", "error"]).default("info").notNull(),
    providerMessageId: varchar("providerMessageId", { length: 240 }),
    httpStatus: int("httpStatus"),
    metaErrorCode: varchar("metaErrorCode", { length: 80 }),
    metaErrorSubcode: varchar("metaErrorSubcode", { length: 80 }),
    message: varchar("message", { length: 500 }),
    metadata: json("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    agentEventIdx: index("instagram_log_agent_event_idx").on(table.agentId, table.eventType, table.createdAt),
    conversationIdx: index("instagram_log_conversation_idx").on(table.conversationId, table.createdAt),
  }),
);
export type InstagramLog = typeof instagramLogs.$inferSelect;
export type InsertInstagramLog = typeof instagramLogs.$inferInsert;

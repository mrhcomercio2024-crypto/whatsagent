/**
 * Lista de modelos LLM disponíveis na ferramenta.
 * Pode ser selecionado por etapa do script ou como padrão de cada agente.
 * O usuário pode escolher livremente entre todos.
 */
export type LlmModelOption = {
  id: string;
  label: string;
  provider: string;
  description: string;
};

export const AVAILABLE_LLM_MODELS: LlmModelOption[] = [
  // OpenAI
  { id: "gpt-4.1", label: "GPT-4.1", provider: "OpenAI", description: "Modelo principal recomendado para vendas." },
  { id: "gpt-4.1-mini", label: "GPT-4.1 Mini", provider: "OpenAI", description: "Equilíbrio velocidade/custo." },
  { id: "gpt-4o", label: "GPT-4o", provider: "OpenAI", description: "Multimodal, ótimo para conversas." },
  { id: "gpt-4o-mini", label: "GPT-4o Mini", provider: "OpenAI", description: "Rápido e econômico." },
  { id: "o4-mini", label: "o4-mini", provider: "OpenAI", description: "Raciocínio avançado, baixo custo." },
  { id: "o3", label: "o3", provider: "OpenAI", description: "Raciocínio profundo, premium." },

  // Anthropic
  { id: "claude-sonnet-4.5", label: "Claude Sonnet 4.5", provider: "Anthropic", description: "Excelente em tom natural." },
  { id: "claude-opus-4.1", label: "Claude Opus 4.1", provider: "Anthropic", description: "Topo de linha em raciocínio." },
  { id: "claude-haiku-4", label: "Claude Haiku 4", provider: "Anthropic", description: "Mais rápido e barato." },

  // Google
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "Google", description: "Multimodal premium do Google." },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "Google", description: "Rápido e custo-efetivo." },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", provider: "Google", description: "Ultra rápido para alto volume." },

  // Open / outros
  { id: "deepseek-v3", label: "DeepSeek V3", provider: "DeepSeek", description: "Open-weights de alta performance." },
  { id: "deepseek-r1", label: "DeepSeek R1", provider: "DeepSeek", description: "Modelo de raciocínio." },
  { id: "llama-4-maverick", label: "Llama 4 Maverick", provider: "Meta", description: "Open-source flagship." },
  { id: "qwen-3-max", label: "Qwen 3 Max", provider: "Alibaba", description: "Forte em multilíngue." },
  { id: "mistral-large-2", label: "Mistral Large 2", provider: "Mistral", description: "Bom raciocínio europeu." },
];

export const isValidLlmModel = (id: string): boolean =>
  AVAILABLE_LLM_MODELS.some(m => m.id === id);

export const DEFAULT_LLM_MODEL = "gpt-4.1";

/**
 * Eventos do sistema de métricas
 */
export const METRIC_EVENTS = {
  CONVERSATION_STARTED: "conversation_started",
  MESSAGE_RECEIVED: "message_received",
  MESSAGE_SENT: "message_sent",
  RESPONSE_TIME_MS: "response_time_ms",
  FOLLOWUP_SENT: "followup_sent",
  HANDOFF_TRIGGERED: "handoff_triggered",
  LEAD_QUALIFIED: "lead_qualified",
  CONVERSION: "conversion",
} as const;

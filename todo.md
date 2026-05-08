# WhatsAgent — TODO

## Fase 1: Setup & Design System
- [x] Inicializar projeto webdev (web-db-user)
- [x] Definir paleta elegante (dark sofisticado), tipografia premium e tokens em index.css
- [x] Configurar fontes Google (Inter + serif de display) no index.html

## Fase 2: Banco de Dados
- [x] Tabela `agents` (multi-agente, persona, modelo padrão, configs operacionais)
- [x] Tabela `agent_brain` (prompt mestre, regras, tom, produtos, objeções)
- [x] Tabela `script_steps` (etapas obrigatórias com ordem, instruções, modelo LLM por etapa, critérios de avanço)
- [x] Tabela `knowledge_base` (textos de RAG)
- [x] Tabela `media_assets` (imagens/vídeos com URL S3, mime, descrição)
- [x] Tabela `media_triggers` (palavra-chave, etapa, ou regra IA → mídia)
- [x] Tabela `whatsapp_config` (phone_number_id, business_account_id, access_token, verify_token, app_secret)
- [x] Tabela `whatsapp_templates` (templates aprovados Meta com variáveis)
- [x] Tabela `leads` (telefone, nome, temperatura, tags). Etapa atual fica em `conversations.currentStepId`.
- [x] Tabela `conversations` (lead, agente, status, ai_paused, atendente humano)
- [x] Tabela `messages` (direção, conteúdo, tipo, metadata WhatsApp, timestamp)
- [x] Tabela `followup_rules` (intervalos, tentativas, com/sem template, qual template, IA ou fixa)
- [x] Tabela `followup_jobs` (agendamentos por lead/conversa)
- [x] Tabela `business_hours` (dias, horários, mensagem fora do horário)
- [x] Tabela `handoff_keywords` (palavras-chave para transferir)
- [x] Tabela `metrics_events` (para dashboard)
- [x] Gerar e aplicar migration

## Fase 3: Backend WhatsApp + IA
- [x] Endpoint webhook GET/POST /api/whatsapp/webhook (verificação + recebimento com assinatura)
- [x] Cliente Meta Cloud API: enviar texto, imagem, vídeo, template
- [x] Motor de IA: orquestrador (cérebro + etapa atual + RAG + memória)
- [x] Seleção de LLM por etapa (lista completa de modelos disponíveis em shared/llm-models.ts)
- [x] Detector de gatilhos de mídia (palavra-chave, etapa, decisão IA)
- [x] Avanço automático de etapas baseado em critérios
- [x] Qualificação automática de lead (quente/morno/frio) via análise IA
- [x] Detector de palavras-chave de handoff → pausar IA + notificar
- [x] Verificação de horário de atendimento + envio de mensagem fora do horário

## Fase 4: Follow-up Engine
- [x] Loop em background varrendo followup_jobs pendentes (60s)
- [x] Cálculo da janela 24h por conversa
- [x] Decisão automática: dentro da janela = livre, fora = template
- [x] Override manual via UI (forçar template ou forçar livre — windowPolicy)
- [x] Geração de mensagem por IA OU mensagem fixa, conforme regra
- [x] Cancelamento automático quando lead responde (cancelOnReply)

## Fase 5: Painel — Configurações
- [x] Layout dashboard com sidebar elegante (AppLayout customizado)
- [x] Página: Lista e edição de Agentes (multi-agente)
- [x] Página: Cérebro do Agente (prompt mestre + regras + tom)
- [x] Página: Etapas do Script (ordem, instruções, LLM por etapa, critérios)
- [x] Página: Base de Conhecimento (RAG) com CRUD
- [x] Página: Biblioteca de Mídias (upload imagem/vídeo + gatilhos)
- [x] Página: Templates WhatsApp aprovados
- [x] Página: Regras de Follow-up (intervalos, tentativas, com/sem template)
- [x] Página: Conexão WhatsApp Cloud API (credenciais Meta + URL do webhook)
- [x] Página: Configurações Operacionais (horário, mensagem fora horário, handoff)

## Fase 6: Painel — Operação
- [x] Inbox em tempo real (lista conversas + chat com refetch 4-5s)
- [x] Botão "Pausar IA" e "Assumir conversa"
- [x] Filtros por temperatura na página de leads
- [x] Detalhes do lead: histórico, tags, etapa, temperatura, qualificação
- [x] Simulador interno (chat sem WhatsApp real)
- [x] Dashboard de métricas (cards de KPIs + grid de eventos)
- [x] Exportação CSV (leads)

## Fase 7: Testes & Polimento
- [x] Vitest: detector de gatilhos (6 testes)
- [x] Vitest: lógica janela 24h e horário de atendimento (7 testes)
- [x] Vitest: auth.logout (1 teste — template)
- [x] Polimento visual (dark sofisticado, verde esmeralda, serif Fraunces)
- [x] webdev_check_status final (sem erros TS / LSP / dependências)

## Fase 8: Documentação Self-Hosted
- [x] README.md com visão geral e instruções rápidas
- [x] SELF_HOSTING.md com guia completo (Meta Cloud API, deploy, operação)
- [x] ENV_VARIABLES.md com tabela de variáveis de ambiente
- [x] Guia operacional dentro do SELF_HOSTING.md (cérebro, etapas, mídias, follow-ups)

## Fase 9: Entrega
- [x] Salvar checkpoint final (versão ed4d2bee)
- [x] Mensagem final ao usuário com links e instruções


## Fase 10: Conexão via QR Code (Baileys — não oficial)
- [x] Instalar dependências `@whiskeysockets/baileys`, `qrcode`, `pino`
- [x] Adicionar coluna `connectionMode` em `agents` (`official` | `qr`) e tabela `qr_sessions` (auth state, status, lastQr, jid)
- [x] Migration aplicada
- [x] Cliente Baileys com persistência da sessão em disco
- [x] Bridge: ao receber mensagem do WhatsApp via Baileys, encaminhar ao orquestrador de IA
- [x] Bridge: enviar texto, imagem e vídeo via Baileys (mesmo contrato do dispatcher)
- [x] Endpoints tRPC: `qr.start`, `qr.status` (retorna QR PNG base64), `qr.disconnect`
- [x] UI: na página WhatsApp, seletor de modo (Oficial / QR Code) com aviso de risco
- [x] UI: exibir QR Code escaneável + status em tempo real (polling 2s)
- [x] Dispatcher e follow-up: rotear envios pelo transporte certo (oficial vs Baileys)
- [x] Ignorar janela 24h e templates quando modo = QR
- [x] Reconnect automático e tratamento de logout/banimento
- [x] Atualizar SELF_HOSTING.md e README com a nova opção e disclaimers
- [x] Checkpoint v2


## Fase 14: Debounce de mensagens
- [x] Adicionar `debounceSeconds` em `agents` (default 8s)
- [x] Adicionar `pendingProcessAt` em `conversations` para coalescer mensagens
- [x] Migration aplicada
- [x] Reescrever webhook/baileys para agendar processamento após debounce
- [x] Worker (loop 1s) que dispara processamento quando o tempo passa sem novas mensagens
- [x] Cancelar/reagendar quando nova mensagem chega antes do prazo

## Fase 15: Simulação de digitação humana
- [x] Adicionar em `agents`: `typingSimulationEnabled`, `typingCps`, `typingMinDelayMs`, `typingMaxDelayMs`, `interMessageDelayMs`
- [x] Migration aplicada
- [x] `sendTypingOn` para API Oficial (Cloud API v21+)
- [x] Typing via Baileys (`presenceSubscribe` + `sendPresenceUpdate`)
- [x] Dispatcher (oficial e Baileys): typing on → atraso → enviar → pausa entre mensagens
- [x] Limites min/max respeitados

## Fase 16: UI — Comportamento humano
- [x] Em `Ops.tsx` adicionar seção "Comportamento humano" com sliders e toggle
- [x] Procedure `agents.updateBehavior` com validações zod

## Fase 17: Polimento e entrega
- [x] Testes vitest para cálculo de tempo de digitação e debounce (10 novos testes, total 26)
- [x] Atualizar SELF_HOSTING.md (seção 5C "Comportamento humano")
- [x] Atualizar README.md
- [x] Checkpoint v3


## Fase 18: Bug — agente não responde após conectar QR Code
- [x] Diagnosticar via logs e leitura de código
- [x] Bug 1: filtro `listConversationsDueForProcessing` aceitava NULL → corrigido com `isNotNull`
- [x] Bug 2: filesystem efêmero do ambiente publicado apaga `creds.json` no restart → mitigado salvando snapshot do auth state em coluna `authBlob` (DB)
- [x] Bug 3: servidor não religava sessões Baileys após restart → `reconnectAllQrSessions()` no boot
- [x] Logs detalhados em baileys/debounce/orchestrator para diagnóstico futuro
- [x] Migration 0004 aplicada (`qr_sessions.authBlob`)
- [x] Testes vitest (31 passando: snapshot ida-e-volta + filtro debounce)
- [x] Checkpoint v4 salvo (e0874810). Validacão end-to-end depende de re-escaneamento do QR pelo usuário após republish.


## Fase 19: Simulador como Emulador WhatsApp realista
- [x] Backend: `simulator.sendMessage` enriquecido com timing + dados de mídia (mediaType, url, caption)
- [x] Frontend: `Simulator.tsx` reescrito como emulador (mockup celular + header WhatsApp + fundo padrão + balões verde/cinza + ticks azuis + timestamp + scroll auto)
- [x] Animações: typing dots, indicador "digitando…" no header, debounce real (countdown), typing por mensagem (proporcional), pausa interMessageDelayMs entre mensagens
- [x] Suporte a renderização de imagem/vídeo/áudio como no WhatsApp + placeholders
- [x] Botão Reiniciar (limpa estado e cancela conversa)
- [x] Painel lateral de diagnóstico (estado e configuração ativa)
- [x] Testes vitest 31/31 passando (não foram acrescidos novos pq a lógica de timing já é coberta por humanize.test.ts)
- [x] Checkpoint v5 (b0718f71)


## Fase 23: Quebra de mensagens longas em vários balões
- [x] Adicionar em `agents`: `splitLongMessages` (bool, default true) e `splitMaxChars` (int, default 220)
- [x] Migration 0005 aplicada
- [x] Procedure `agents.updateBehavior` aceita os novos campos
- [x] UI Operação: toggle e slider (80–600 chars) na seção "Comportamento humano"
- [x] Helper `splitMessage(text, options)`: parágrafos → frases → palavras (sem cortar no meio)
- [x] 9 testes vitest do splitter
- [x] Dispatcher Oficial aplica quebra (cada balão passa por typing + pausa)
- [x] Dispatcher Baileys aplica quebra (mesmo pipeline)
- [x] Simulator backend devolve balões já quebrados
- [x] Checkpoint v6 (d09c7add)


## Fase 27: Aba de Custos
- [x] Tabelas `llm_usage`, `llm_prices` e `cost_extras` no schema
- [x] Migration 0006 aplicada
- [x] Seed da `llm_prices` com preços de referência (15 modelos OpenAI/Anthropic/Google)
- [x] `invokeWithModel` instrumentado: registra agentId/conversationId/leadId/purpose + tokens + custo
- [x] Helper `computeCostMicroUsd` + `referenceCostMicroUsd`
- [x] Procedures tRPC: `costs.summary/byLead/extras.list/extras.add/extras.remove/prices.list/prices.upsert/prices.reseed`
- [x] Página `Costs.tsx` com filtros (período + escopo agente/todos), 4 cards (custo IA, médio por lead, tokens, taxas extras), tabela por modelo, gráfico diário em barras, top leads, CRUD de outras taxas e editor de preços por modelo (com 'Restaurar referência')
- [x] Item "Custos" no menu lateral
- [x] 12 testes vitest do cálculo de custo
- [x] Checkpoint v7 (6489c2cf)


## Fase 32: Schema reconhecimento + blindagem
- [x] Tabela `restricted_terms` (id, agentId, term, action 'block'|'rewrite', createdAt)
- [x] Coluna `literalMode` (e `literalText`) em `script_steps`
- [x] Migration aplicada

## Fase 33: Reconhecimento de áudio e imagem do lead
- [x] Helper `transcribeFromUrl` (Whisper) e `describeImage` (Vision) em `server/ai/mediaRecognition.ts`
- [x] Webhook oficial: detectar audio/image/document, baixar via Graph API, processar
- [x] Baileys: detectar audioMessage/imageMessage/documentMessage, baixar buffer, processar
- [x] Custos registrados (purpose=transcription / vision)

## Fase 34: Blindagem do agente ao cérebro
- [x] System prompt reforçado com regras estritas (cérebro/RAG > resposta livre)
- [x] Modo literal por etapa: envia copy textual sem reescrever
- [x] Validador pós-geração: bloqueia/regenera + masking fallback
- [x] UI: editor de termos proibidos em Brain
- [x] UI: toggle "Modo literal" + campo de texto literal em Steps

## Fase 35: Tempo real (polling agressivo + indicadores)
- [x] Polling 1.5s da conversa selecionada
- [x] Indicador "IA digitando…" baseado em `pendingProcessAt`
- [x] Indicador "você está digitando…" para o operador humano

## Fase 36: Aba Chat em tempo real (substitui Inbox)
- [x] Rota /chat criada (Inbox preservado em /inbox como fallback)
- [x] Lista lateral de conversas com busca por nome/telefone
- [x] Painel central WhatsApp Web ao vivo (balões verde/cinza, mídia inline, áudio com player)
- [x] Indicador "digitando…" para a IA (typing dots animado)
- [x] Pausar IA / Assumir conversa: composer humano funcional

## Fase 37: Testes + checkpoint v8
- [x] Testes vitest do validador de termos proibidos (`findRestrictedHits`)
- [x] Testes vitest do mascaramento (`maskRestrictedTerms`)
- [x] Suite completa verde (64/64)
- [x] Checkpoint v8


## Fase 38: Migração do chat para SSE
- [x] Pub/sub em memória `server/realtime/bus.ts` com canais por conversationId
- [x] Endpoint Express `/api/chat/stream/:conversationId` (SSE) protegido por cookie + heartbeat
- [x] Eventos: `message`, `typing.agent` (thinking/writing/delivering/idle), `status`
- [x] Hooks: `appendMessage` publica `message`; orchestrator emite `typing.agent`; `updateConversation` emite `status`
- [x] Webhook Cloud API e Baileys já vão por `appendMessage`, então publicam automaticamente
- [x] Chat.tsx consumindo EventSource com fallback de polling de 15s + heurístico antigo
- [x] Vitest do bus pub/sub (5 cenários)
- [x] Checkpoint v9

## Fase 39: Memória, fidelidade ao script e /limpar
- [x] Coluna `summary` (text) e `summaryUpdatedAt` em `conversations` (migration 0008)
- [x] Helper `resetConversation(convId)`: deleta mensagens, zera summary/currentStep, cancela jobs, volta etapa 1
- [x] Resumidor evolutivo `server/ai/summarizer.ts` (`shouldRefreshSummary` + `refreshConversationSummary`, purpose=summary)
- [x] Prompt: bloco "RESUMO DA CONVERSA" obrigatório + regras anti-repetição
- [x] Prompt: bloco "ETAPA ATUAL" com critério de avanço explícito + proibição de pular etapas
- [x] Comando `/limpar` no orchestrator, simulator (front + back) e sendHumanMessage
- [x] Vitest `memory.test.ts` (9 cenários) — 78/78 verde
- [x] Checkpoint v10

## Fase 40: Configuração por agente do resumidor
- [x] `summaryEveryN` (default 6) e `summaryLlmModel` (nullable) em `agents` (migration 0009 aplicada)
- [x] Procedure `agents.updateSummaryConfig` (every 3..30, modelo opcional)
- [x] `summarizer` usa `summaryLlmModel || defaultLlmModel`
- [x] `orchestrator` usa `agent.summaryEveryN` no `shouldRefreshSummary`
- [x] UI Operação: seção "Memória da conversa" com slider 3–30 + select de modelo ("Usar modelo padrão do agente" incluído)
- [x] Vitest: 2 novos casos para `every` customizado (suite 80/80 verde)
- [x] Checkpoint v11

## Fase 41: Bug — agente "lê as etapas" em vez de executá-las
- [x] Reler `buildSystemPrompt` e identificar onde as instruções da etapa viravam texto de saída
- [x] Bloco ETAPA ATUAL reescrito como DIRETIVA INTERNA (uso interno; não citar)
- [x] Funil agora aparece só como esqueleto (nomes), sem instruções
- [x] Regras invioláveis: "escreva apenas a próxima mensagem", proibida narração/lista/markdown
- [x] `looksLikeStepLeak(text, step)` em prompt.ts (prefixos, listas numeradas, repetição literal, markdown/bullets)
- [x] Orchestrator: se vazamento detectado, regenera 1x com prompt corretivo; persistindo, fallback humano curto
- [x] `literalMode` + `literalText` já enviavam literal; reforçado no prompt como bloco <<< >>>
- [x] Vitest `stepLeak.test.ts` (9 cenários) — 89/89 verde
- [x] Checkpoint v12

## Fase 42: Limite de mensagens por etapa (auto-avanço)
- [x] Coluna `maxMessages` (int, nullable) em `script_steps` (migration 0010 aplicada)
- [x] Helpers puros `shouldAutoAdvanceByCount` + `countAiMessagesInCurrentStep` (`server/ai/stepLimit.ts`)
- [x] Orchestrator: antes do MODO LITERAL e da chamada LLM, conta mensagens da IA na etapa atual e avança se atingir o teto
- [x] Log explícito quando o auto-avanço ocorre (motivo: max_messages) + warn quando é a última etapa
- [x] Procedures `steps.create` e `steps.update` aceitam `maxMessages` (1..50 ou null)
- [x] UI Etapas: input numérico "Avançar após N mensagens (anti-trava)" + badge "máx N msg" na lista
- [x] Vitest `stepLimit.test.ts` (7 cenários) — 96/96 verde
- [x] Checkpoint v13

## Fase 43: Bug — agente pula etapas iniciais (responde da Etapa 2/3 sem cumprimentar)
- [x] Prompt: regra dura de NUNCA antecipar etapas seguintes + cita explicitamente o nome da próxima etapa
- [x] Prompt: regra 5.1 — NUNCA STEP_ADVANCE no primeiro turno
- [x] Prompt: "você está na etapa N de M: 'X'" para a IA se localizar
- [x] Helper puro `canAdvanceStep` em `server/ai/stepSkip.ts`: bloqueia avanço sem inbound real e em primeiro turno
- [x] `currentStepId` agora é persistido na 1ª resposta da IA (mesmo sem advance)
- [x] Detector `looksLikeStepSkip(text, current, all, isFirstTurn)` baseado em keywords das etapas futuras
- [x] Orchestrator: regenera 1x com instrução estrita; persistindo, devolve fallback humano fiel à etapa atual
- [x] Vitest `stepSkip.test.ts` (14 cenários) — 110/110 verde
- [x] Checkpoint v14

## Fase 44: Bug — agente travado em fallback genérico repetido
- [x] `looksLikeStepSkip` recalibrado: MIN_FUTURE_HITS 2/3, MARGIN 2/3, e desativado a partir de 2 inbounds
- [x] Removido fallback humano fixo: regen mantém a resposta da IA mesmo se ainda parecer skip
- [x] Anti-repetição: detecta duplicata exata (normalizada) da última outbound; regenera 1x; persistindo, suprime o balão
- [x] Vitest novos: 1 caso de "já há inbounds" + frase neutra fora de primeiro turno (suite 111/111)
- [x] Checkpoint v15

## Fase 45: Debounce fixed window
- [x] Mapeados os call sites: `webhook.ts`, `baileys.ts`, `debounceWorker.ts` (clear) e `db.ts`
- [x] `setConversationPendingProcessAt` agora preserva janela existente; aceita `{force:true}` e `at=null` para clear
- [x] `debounceWorker` já zera após processar (sem mudança necessária)
- [x] Vitest `debounceFixedWindow.test.ts` (6 cenários) — 117/117 verde
- [x] Checkpoint v16

## Fase 46: Simulador — manter histórico persistido
- [x] Procedure `simulator.history` carrega mensagens do número `+55SIMULATED` (sem criar lead/conv)
- [x] `findLeadByPhone` + `findConversationByLead` (helpers find-only) em `db.ts`
- [x] Simulator.tsx carrega o histórico no mount; reset só via `/limpar`
- [x] Botão "Reiniciar" removido do header; descrição explica que só `/limpar` zera
- [x] Vitest `simulatorHistory.test.ts` (5 cenários) — 122/122 verde
- [x] Checkpoint v17

## Fase 47: Debounce fixed window no front do Simulador
- [x] `scheduleProcessing` só inicia o timer se ainda não houver um rodando
- [x] Mensagens subsequentes apenas entram em `queueRef`, NÃO reagendam
- [x] Após processar, libera o slot para a próxima janela (timer = null no clear)
- [x] Vitest `simulatorDebounce.test.ts` (4 cenários) — 126/126 verde
- [x] Checkpoint v18

## Fase 48: Agente flexível — passar sutilmente pelas etapas
- [x] HARD_RULES reescrito: prioridade #1 = responder à última pergunta do lead, antes de seguir o roteiro
- [x] Etapas tratadas como "objetivos" (vendedor consultivo flexível) — pode cumprir etapa enquanto responde outra
- [x] Permite STEP_ADVANCE sem reperguntar quando a fala do lead já entrega a informação da etapa
- [x] `leadAskedQuestion(text)` heurística simples (interrogação + termos como quanto/como/qual)
- [x] `looksLikeStepSkip` ignora antecipação quando o lead perguntou diretamente (e não é 1º turno)
- [x] Bloco da etapa atual com instruções de "como conduzir" (consultivo) + obrigatória/opcional
- [x] Testes antigos atualizados para nova redação + 6 testes novos (leadAskedQuestion + flex)
- [x] Suite verde 133/133
- [x] Checkpoint v19

## Fase 49: Bug — agente ignora a última mensagem do lead
- [x] Auditado: histórico chega correto e em ordem cronológica (slice(-30) + cron asc); inbound atual já está nele
- [x] Bloco ÚLTIMA MENSAGEM DO LEAD literal entre <<< >>> no fim do system prompt
- [x] Heurística `buildShortReplyHint`: detecta concordância/negação curta + pergunta curta
- [x] Regra anti-contradição: "NUNCA responda 'não, não é bem assim'" quando lead concorda
- [x] Vitest `lastInbound.test.ts` (9 cenários) — 142/142 verde
- [x] Checkpoint v20

## Fase 50: Cérebro do Agente em Markdown
- [x] `MarkdownEditor` com toolbar (Bold/Itálico/H2/Listas/Quote/Code/Link), atalhos Ctrl+B / Ctrl+I e modos Editar/Split/Preview
- [x] Preview ao vivo via Streamdown (já disponível no projeto), respeitando classes prose/dark
- [x] Brain.tsx: todos os 6 campos longos migrados para MarkdownEditor, payload tRPC inalterado (string Markdown)
- [x] Vitest `markdownInsert.test.ts` (8 cenários cobrindo wrap, prefix multi-linha, link c/ e s/ seleção)
- [x] Suite verde 150/150
- [x] Checkpoint v21

## Fase 51: Auditoria de fluxo do agente
- [x] Mapear pipeline (orchestrator, prompt, dispatcher, db, webhook, baileys) — concluído na auditoria (AUDIT_REPORT.md)
- [x] Rodar suite vitest completa e revisar cobertura — 156/156 verde
- [x] Compilar fragilidades por criticidade — entregue em AUDIT_REPORT.md
- [x] Entregar relatório priorizado com recomendações — entregue ao usuário

## Fase 52: Investigar variação do agente "Ravi teste" no Simulador
- [x] Inspecionar agent_brain e script_steps do agente Ravi para identificar a causa — diagnóstico entregue
- [x] Diagnosticar: script vs cérebro vs orchestrator — script (Etapa 4 monolítica) identificada como causa
- [x] Reportar diagnóstico com recomendação — entregue (proposta opção B: 2 etapas largas)
- [x] Bug: "(Sem resposta — verifique cérebro/etapas)" — corrigido na Fase 53 (anti-repetição não suprime + safety net)


## Fase 53: Bug "(Sem resposta — verifique cérebro/etapas)" no Simulador
- [x] Diagnóstico: anti-repetição persistente suprimia totalmente o balão (`aiOutput=""`) → `actions: []` → frontend exibia o fallback de erro
- [x] Correção 1: anti-repetição agora mantém a saída regenerada mesmo se persistir similar (em vez de suprimir)
- [x] Correção 2: safety net no fim do orchestrator — se `actions=[]` em conversa normal (não handoff/out-of-hours), envia frase neutra "Pode me contar um pouco mais? Quero te entender melhor pra te ajudar do jeito certo."
- [x] Testes vitest: `orchestratorSafety.test.ts` (6 testes) cobre buildSystemPrompt sem etapas + parseAgentOutput vazio
- [x] Suite completa verde (156/156)


## Fase 54: Tags automáticas de status do lead + trava por tag bloqueante (ENTREGUE no checkpoint 231fbf48)
- [x] Alinhar desenho com o usuário (tags, tag bloqueante, mensagem padrão)
- [x] Schema: nova tabela `lead_status_rules` + campo `statusTag` em `leads`
- [x] Migration aplicada
- [x] Classificador IA: detecta status ao processar inbound e atualiza `lead.statusTag`
- [x] Orchestrator: ao entrar, se lead.statusTag == tag bloqueante → responde replyWhenBlocked + pausa IA (aiPaused=true) + handoff opcional
- [x] UI: aba "Status automático" em Brain (CRUD de regras)
- [x] UI: badge do statusTag em Chat e Leads
- [x] Testes vitest
- [x] Checkpoint 231fbf48


## Fase 54: Tags automáticas de status do lead (membro_wedrop etc.)
- [x] Schema: nova tabela `lead_status_rules` + campos `statusTag`/`statusTagSetAt` em `leads`
- [x] Migration 0011 aplicada
- [x] Classificador IA `statusClassifier.ts` com JSON estrito (none em caso de dúvida)
- [x] Middleware no orchestrator: trava, envia replyWhenBlocked, pausa IA, handoff, notifyOwner
- [x] Router tRPC `leadStatusRules` (list/create/update/remove/clearLeadTag)
- [x] UI em Brain.tsx — seção "Status automático do lead" com CRUD
- [x] UI em Leads.tsx — coluna "Status auto" com badge bloqueante + botão limpar
- [x] 7 testes vitest novos em `statusClassifier.test.ts`
- [x] Suite total 163/163 verde
- [x] Regra `membro_wedrop` pré-cadastrada para o agente "Ravi teste"

## Fase 55: Bug crítico Baileys/QR — agente se auto-responde
- [x] Diagnosticar: encontradas 2 armadilhas (newsletter/@lid e self-message quando remoteJid == selfJid)
- [x] Corrigir: função `shouldProcessInbound` centralizada + blindagem no dispatcher antes de enviar
- [x] Testes vitest de regressão (11 novos em `baileys.inboundFilter.test.ts`)
- [x] Suite 174/174 verde
- [x] Checkpoint v25 + instruções de re-teste


## Fase 56: Bug "Connection Failure / Sessão expirada" no QR
- [x] Diagnosticar: snapshot do banco ressuscitava creds inválidos a cada Iniciar Conexão + botão de wipe estava escondido
- [x] Corrigir: wipe automático quando WhatsApp fecha com Connection Failure/401/440/515; wipe manual agora limpa authBlob; botão de wipe sempre visível quando há lastError; mensagem orientativa
- [x] Suite 174/174 verde
- [x] Checkpoint v26 + instruções


## Fase 57: Refinar tratamento de "Stream Errored (restart required)"
- [x] Separar erros recuperáveis (restart-only) de terminais (wipe) no handler de close do Baileys (agora restart=515 reconecta em 1.5s sem apagar creds; erros realmente terminais continuam disparando wipe)
- [x] Suite 174/174 verde + checkpoint v27


## Fase 58: Refazer Chat — painel "Detalhes do Lead" (PARCIAL)
- [x] Histórico do Lead entregue na Fase 60 (modal timeline)
- [x] Demais seções — backlog adiado (não solicitado pelo usuário nas sessões subsequentes)


## Fase 59 (BLOQUEANTE): Mensagem AI não chega ao WhatsApp real
- [x] Causa: Baileys novo entrega remoteJid em formato @lid (LID interno do WhatsApp Multi-Device); enviar para `<lid>@s.whatsapp.net` faz o WhatsApp descartar silenciosamente
- [x] Corrigido: `resolveRealPhone` prefere `senderPn`/`participantPn`; campo `isLid` em `leads`; dispatcher usa `<id>@lid` quando `isLid=true`
- [x] Backfill aplicado em 3 leads existentes (Marcelo, Italo, Jac)
- [x] 8 testes vitest novos em `baileys.lid.test.ts`
- [x] Checkpoint v28 (f61d67cf)


## Fase 60: Modal Histórico do Lead (timeline)
- [x] Backend: procedure `leads.history` agregando eventos ordenados (mensagens IN/OUT, templates, step_advance, handoff, ai_paused/resumed, status_tag, qualification, followup)
- [x] Frontend: `LeadHistoryDialog` com timeline visual (ícones coloridos por tipo, badges, agrupamento por dia) acionado do botão Histórico no header do Chat
- [x] Testes vitest: 7 novos em `leadHistory.test.ts`; suite 189/189 verde
- [x] Checkpoint v29


## Fase 61–64: Upgrades de mídia (consolidados)
- [x] 61: Pausas naturais antes/depois da mídia (1.5–4s antes, 2–5s depois) com jitter humano — dispatcher + Baileys
- [x] 62: Gatilho por intenção LLM (`intentClassifier.ts`) + tipo `intent` em media_triggers + UI no aba Mídias
- [x] 63: Estado `awaitingMediaReaction*` em conversations + `reactionClassifier.ts` (positive/neutral/negative/ignored) + bloco no prompt
- [x] 64: Coluna `purpose` em media_assets + UI agrupada + prompt agrupa por propósito
- [x] Testes vitest: 209/209 verde
- [x] Checkpoint v30 (34908f18)


## Fase 66 (BLOQUEANTE): Endurecer Baileys para alto volume sem cair instance
- [x] Auditar pontos frágeis: keep-alive, reconnect, queue, memória, locks, persistência
- [x] 66a: Reconnect robusto — backoff exponencial (1s→60s, jitter ±500ms) + watchdog 60s + heartbeat 30s; cancel pendente no disconnect (`server/whatsapp/reconnect.ts`)
- [x] 66b: Fila de inbound — processamento sequencial FIFO por (agentId:remoteJid); conversas distintas continuam em paralelo (`server/whatsapp/inboundQueue.ts`)
- [x] 66c: Persistência confiável de creds — debounce 2s agrupando rajadas Signal + flush síncrono no SIGTERM/SIGINT (`server/whatsapp/credsSaver.ts`)
- [x] 66d: Rate limiting (token bucket 20/min/agente, espera sem rejeitar) + painel "Saúde do bridge WhatsApp" no Dashboard com uptime, msgs/min, reconnects, último backoff, rate limited e últimos erros (refresh 5s)
- [x] Testes vitest 27 novos (backoff/scheduler 10, fila FIFO 7, rate limiter 4, credsSaver 6) — suite total 236/236 verde
- [x] Checkpoint v31


## Fase 67: Eventos Externos (webhooks de plataformas) — CONCLUÍDA
- [x] Schema: `external_event_sources` (id, agentId, name, slug único, secret HMAC, ativo, createdAt)
- [x] Schema: `external_events` (id, sourceId, agentId, eventType, leadId nullable, leadIdentifier, payload JSON, status, errorMessage, receivedAt, processedAt)
- [x] Schema: `external_event_rules` (id, agentId, sourceId nullable, eventType, ações JSON, enabled, priority, createLeadIfMissing)
- [x] Migration 0016 aplicada
- [x] Endpoint POST `/api/external-events/:slug` com verificação HMAC SHA-256 (suporta `X-Signature: sha256=hex`, `v1=`, `x-hotmart-hottok`)
- [x] Resposta 202 imediata + processamento em background (não bloqueia retry da plataforma)
- [x] Helper `extractIdentifiers` recursivo: telefone normalizado BR (com/sem DDI/DDD/máscara) + email lower; busca em `buyer_phone`, `customer_email`, `telefone`, etc.
- [x] Motor de regras com 8 ações: `moveToStep`, `setTemperature`, `addTag`, `sendMessage` (free/fixed/template), `pauseAi`, `resumeAi`, `handoff`, `notifyOwner`
- [x] `delayMinutes` por mensagem — agenda via `followup_jobs`
- [x] Variáveis Mustache em texto fixo: `{{name}}`, `{{phone}}`, `{{email}}`, `{{payload.x.y}}`
- [x] Mensagens "free" geradas pela IA com persona do agente + payload como contexto
- [x] Procedures tRPC: `externalEvents.{listSources, createSource, updateSource, rotateSecret, deleteSource, listRules, upsertRule, deleteRule, listEvents, retryEvent}`
- [x] Item "Eventos Externos" no menu lateral (ícone Webhook)
- [x] Página `/external-events` com 3 abas: Fontes (URL+secret revelável+rotate+enable), Regras (builder visual de ações com reorder), Log (filtro por status, expand payload, reprocessar)
- [x] 29 testes vitest novos (identify 13, hmac 8, engine 8) — suite total 265/265 verde
- [x] Checkpoint v32


## Fase 68: Janela de horário em reengajamentos + mídias anexáveis + fix do agente — CONCLUÍDA
- [x] Diagnosticado: sessão Baileys do agente 1 estava deslogada ("not logged in, attempting registration") em loop porém sem QR escaneado pelo usuário + bug `presenceSubscribe` sem JID quebrava o heartbeat
- [x] Fix Baileys: code 408/"QR refs attempts ended" reconhecido como `qr_pending` (para reconnect, exige escaneamento manual); `isAgentConnected` agora exige `sock.user?.id`; `sendBaileysHeartbeat` defensivo (skipa se sem JID)
- [x] Schema: `allowedStartHour` (0-23) e `allowedEndHour` (0-23) em `followup_rules` (TZ do servidor)
- [x] Migration 0017 aplicada
- [x] Parser `extractMediaTags(text)` no servidor: extrai tags `@midia[nome]`, devolve `cleanText` + `uniqueNames`; `resolveMediaByName` resolve por `name` (case-insensitive, com/sem extensão)
- [x] Procedure tRPC `media.list` reaproveitada para popular o autocomplete
- [x] UI Followups: novo editor com layout do print — Tempo de espera (valor + unidade), Hora inicial/final permitida, Template Meta, Origem da mensagem, textarea com autocomplete, switches
- [x] UI Followups: componente `MediaTagTextarea` — popover ao digitar `@`, lista filtrável das mídias do agente, atalhos rápidos para anexar
- [x] UI Followups: prévia com chip removível por mídia (ícone por tipo: imagem/vídeo/áudio/documento) e marcação vermelha quando o nome não casa com nenhuma mídia
- [x] UI Followups: card de "Orientações de como criar um follow-up" exatamente como o segundo print
- [x] Backend disparo: `isWithinAllowedWindow` + `nextAllowedAt` aplicados no engine — fora da janela, o job é reagendado para a próxima janela permitida
- [x] Backend disparo: extrai `@midia[]`, envia texto sem tags + sequência de mídias resolvidas (no modo QR/não oficial); avisa em log quando nome não resolve ou quando rota é Cloud API (só texto)
- [x] 16 testes vitest novos (mediaTags 10, timeWindow 6) + suite total 281/281 verde
- [x] Checkpoint v33


## Fase 69: Agente trava após primeira resposta (BLOQUEANTE) — CONCLUÍDA
- [x] Diagnosticado por logs reais: `dispatch ... @lid` levou 49s entre começar e marcar enviada — `sock.sendMessage` para `@lid` não confirmava o ack e segurava o orchestrator por minutos
- [x] Diagnosticado: `saveCreds snapshot failed` em loop — coluna `qr_sessions.authBlob` era `text` (≈64KB) e estava estourando com sessão ativa cheia de preKeys, deslogando a sessão
- [x] Migration 0018: `authBlob` agora `longtext` (4GB)
- [x] Fix backend: `withTimeout(sock.sendMessage, 20s)` aplicado em todos os 5 envios (texto + 4 tipos de mídia) — timeout libera o slot e loga `send failed (jid=..., type=...): sendMessage timeout (20s)`
- [x] Fix backend: `processDueConversations` agora paraleliza com `Promise.all` + hard-cap de 90s por conversa — uma conversa lenta não bloqueia mais o tick
- [x] 3 testes vitest novos (sendTimeout) + suite total 284/284 verde
- [x] Checkpoint v34


## Fase 70: Reenvio automático de mensagens falhadas — CONCLUÍDA
- [x] Schema: tabela `message_retries` (agentId, conversationId, leadId, payload JSON, attempt, maxAttempts, nextRetryAt, status enum, lastError, createdAt, completedAt)
- [x] Migration 0019 aplicada
- [x] Helper `enqueueRetry(payload, error)` chamado em todo `catch` do `dispatchViaBaileys` (texto + 4 tipos de mídia + caso "no live socket")
- [x] Flag `__isRetry` evita loop infinito (uma falha de retry não cria outro retry, marca direto como exhausted)
- [x] Worker `retryWorker` tica a cada 10s; pega `pending` com `nextRetryAt <= now`; reenvia via `dispatchActions`
- [x] Backoff exponencial: 30s, 2min, 5min, 15min, 30min (5 tentativas máximas, configurável)
- [x] Cancelamento automático: ao receber inbound, todos os retries pendentes da conversa viram `cancelled_by_reply` (chamada em `handleInbound`)
- [x] Procedures tRPC: `messageRetries.{list, countPending, retryNow, cancel}`
- [x] Página **/retries** no menu lateral: tabs Pendentes/Todos, contador de pendentes, status badges, tooltip com erro completo, botões Reenviar agora / Cancelar
- [x] 15 testes vitest novos (retryBackoff: nextRetryAt 8, hasMoreAttempts 2, sanitizeError 5) — suite total 299/299 verde
- [x] Checkpoint v35


## Fase 71: Filtro de busca por nome/telefone na página de Reenvios — CONCLUÍDA
- [x] Helper puro `normalizeSearch` (`server/whatsapp/retrySearch.ts`): detecta telefone (≥4 dígitos majoritários) ou nome; `escapeLike` escapa `%` `_` `\`
- [x] `listMessageRetries` agora aceita `search` opcional, faz `LEFT JOIN leads`, filtra `LIKE %digits%` em `phoneNumber` OU `LOWER(name) LIKE %text%`
- [x] Procedure tRPC `messageRetries.list` aceita `search` (max 120 chars)
- [x] UI `/retries`: campo de busca com ícone, debounced 300ms, botão limpar; tabela com nova coluna **Lead** (nome + telefone formatado em pt-BR)
- [x] Estado vazio dedicado quando a busca não casa: “Nenhum reenvio encontrado” com o termo buscado
- [x] 6 testes vitest novos (`normalizeSearch` 4 + `escapeLike` 2) — suite total 305/305 verde
- [x] Checkpoint v36


## Fase 72: Chats em tempo real com indicadores de digitação — CONCLUÍDA
- [x] Bus estendido com `typing.agent` (thinking/writing/delivering/idle), `typing.lead` (composing/paused/idle) + canal global por agente; `bindConversationToAgent` rotea automaticamente
- [x] Endpoint SSE `GET /api/live/stream?agentId=` (auth + validação de agente) com heartbeat de 25s
- [x] `presence.update` do Baileys capturado (composing→composing, paused/available→idle)
- [x] Orchestrator emite `typing.agent` em todas as fases (thinking/writing/delivering) + idle final
- [x] Agregador `liveActivity` in-memory com TTL 8s typing, prune 5min, snapshot ordenado desc
- [x] Procedures tRPC `live.{listActive, recentMessages}` (snapshot + mensagens recentes)
- [x] Página `/live`: 3 cards de métricas + lista lateral com badge "Ao vivo", dot pulsante <4s, indicador IA pensando/escrevendo/enviando + Lead digitando com 3 pontinhos
- [x] Janela de chat estilo WhatsApp (verde outbound / cinza inbound), auto-scroll, balão flutuante de "digitando…"
- [x] Item **Chats ao vivo** no menu lateral com ícone Activity
- [x] EventSource reconecta nativamente; refetch tRPC a cada 5s como rede de segurança
- [x] 9 testes vitest novos (`liveActivity`) — suite total 314/314 verde
- [x] Checkpoint v37


## Fase 73: BUG agente repete a mesma mensagem ignorando o lead
- [x] Reproduzir nos logs (orchestrator + debounceWorker + retryWorker) o exato 15:20/15:21/15:22
- [x] Identificar causa raiz: concatRecentInbound pegava todo inbound dos últimos 5min (incluindo já respondidos)
- [x] Trava de idempotência: hash SHA-1 da última outbound por conversa em janela de 90s (server/whatsapp/idempotency.ts)
- [x] Corrigir causa raiz: concatRecentInbound filtra apenas inbound após a última outbound (createdAt > maxOutboundCreatedAt)
- [x] Garantir que conteúdo das mensagens do lead pendentes seja sempre incluído no contexto da IA
- [x] Testes vitest do helper de idempotência (9 casos)
- [x] Checkpoint v38 (cebab635)


## Fase 74: Editor completo de regras de Eventos Externos
- [x] Inspecionar estado atual (schema external_event_rules, engine, página /external-events)
- [x] Schema: campos novos em external_event_rules (channelAgentId, templateId, delayMinutes, moveToStepId, tagLabel, aiContext, isActive)
- [x] rotateSecret já existia em externalEvents router; UI agora chama a partir do editor
- [x] Migration 0020 aplicada
- [x] Engine: respeita isActive=false (skipa em loadRulesFor), aplica delayMinutes (agenda exec via setTimeout), executa moveToStep + addTag + sendTemplate Cloud API + anexa aiContext em conversation.summary (vai pro próximo prompt da IA)
- [x] Procedure tRPC: externalEvents.listChannels (apenas agentes Cloud API conectados)
- [x] Procedure tRPC: externalEvents.listChannelTemplates (apenas templates aprovados)
- [x] rotateSecret reaproveitado (já existia)
- [x] UI: editor com Canal, Template carregado do canal, Aguardar, Mover para, Associar tag, Contexto IA, toggle Ativo, URL do Webhook + Regenerar/Copiar
- [x] Testes vitest (4 novos casos do v2 path: tag/move/contexto, fallback sem credenciais, envio Cloud API + appendMessage, agendamento). Suite total 327/327 verde.
- [x] Checkpoint v39


## Fase 75: BUG agente responde no chat interno mas não no WhatsApp real
- [x] Coletar logs do dispatcher
- [x] Causa raiz identificada: ECONNRESET do MySQL durante upsertQrSession dentro do handler `connection.update` do Baileys derrubava o processo Node inteiro (exit). Outbound era gravada no DB mas o processo morria antes do dispatcher entregar.
- [x] Blindagem 1: try/catch envolvendo TODO o handler `connection.update` (server/whatsapp/baileys.ts L191-317)
- [x] Blindagem 2: try/catch individual ao redor de cada chamada de `upsertQrSession` (open/close/qr)
- [x] Blindagem 3: safety nets process-level (`uncaughtException`/`unhandledRejection`) em server/_core/index.ts
- [x] Testes vitest baileys.crashGuard.test.ts (5 casos verificando que ECONNRESET nunca propaga)
- [x] Suite total 332/332 verde
- [x] Checkpoint v40


## Fase 76: Dead-Letter Queue (DLQ) para outbounds não entregues
- [x] Investigar dispatcher: estrutura DLQ já existia parcialmente (tabela `message_retries`, `enqueueMessageRetry`, `retryWorker` de 10s, cancelamento automático se lead responder, exhaustion após N tentativas, backoff [30s,2m,5m,15m,30m])
- [x] Cloud API dispatcher: agora enfileira DLQ quando sendText/sendMedia retorna `ok:false` (antes só marcava `waStatus=failed`)
- [x] Baileys: agora enfileira DLQ também no caso de socket morto (antes só persistia sem entregar)
- [x] Gatilho automático: `markConnected` no Baileys dispara `runRetryWorkerNow()` para reentregar a fila assim que o socket volta
- [x] UI Chat: componente `DlqBanner` no topo da conversa mostra "N mensagens pendentes" + botão "Reenviar agora" (chama `flushConversation`)
- [x] Procedures novas: `messageRetries.countByConversation`, `listByConversation`, `flushConversation` (marca pendings como `nextRetryAt=now` e dispara tick imediato)
- [x] Testes vitest (`server/whatsapp/dlq.test.ts`): backoff sequence, clamping, hasMoreAttempts, sanitizeError, payload contract
- [x] Suite completa 340/340 verde
- [x] Checkpoint v41


## Fase 77: BUG QR Code Baileys rotacionando em loop antes de escanear
- [x] Reproduzido nos logs: `QR refs attempts ended` (60s sem scan) → onClose marca `awaiting_qr` → watchdog 60s pega da lista e religa → novo QR → loop infinito
- [x] Causa raiz: `listReconnectableQrSessions()` em db.ts incluía `awaiting_qr` e `connecting` na lista de "deve religar" — o watchdog ressuscitava o socket antes do usuário escanear
- [x] Corrigido: a função agora retorna apenas sessões em `connected` ou `disconnected` (status que indicam que JA estiveram pareadas)
- [x] Sessões novas ficam aguardando o clique "Iniciar conexão" para gerar QR novamente — sem auto-religação prematura
- [x] Testes vitest `qrLoop.test.ts` (4 casos: lista vazia, religa connected caído, não religa live, contrato dos status válidos)
- [x] Suite completa 344/344 verde
- [x] Checkpoint v42


## Fase 78: QR Code só ao clicar Iniciar Conexão (zero auto-start)
- [x] Mapear todas as chamadas a startQrSession() no projeto (consolidado na Fase 78 final)
- [x] Boot do servidor: removido auto-start completamente
- [x] Página de Conexão: nunca disparou startQrSession no mount (validado)
- [x] Reconnect/watchdog: removido também do onClose — zero auto-religação
- [x] Botão "Iniciar conexão" é o Único ponto que chama startQrSession()
- [x] Testes vitest `onDemand.test.ts` (7 casos garantem o contrato)
- [x] Checkpoint v43 (a3d1c978)


## Fase 78: QR só ao clicar "Iniciar conexão" + parar após conectado + notificação
- [x] Mapeadas as chamadas: boot (`reconnectAllQrSessions`+`startBaileysLifecycle`), watchdog tick (chama startSession), onClose (chama scheduleReconnect)
- [x] Boot: removido `reconnectAllQrSessions()` e `startBaileysLifecycle()` — agora só loga `auto-start desabilitado — conexão on-demand`
- [x] Watchdog/heartbeat: nunca são iniciados no boot — ficam disponíveis se alguém chamar manualmente, mas estão **desligados por padrão**
- [x] Página de Conexão: nunca disparou startQrSession no mount (só no clique do botão, já estava certo)
- [x] Reconnect automático após queda: removido `scheduleReconnect()` do bloco onClose — agora só marca disconnected, cancela qualquer reconnect pendente e loga "aguardando clique manual"
- [x] UI: toast verde "Conectado com sucesso a <jid/displayName>" no evento `open` (transição de status para connected)
- [x] UI: toast vermelho em `logged_out`/`banned`; toast âmbar em `disconnected` após ter estado `connected` — sempre orientando a clicar "Iniciar conexão"
- [x] Testes vitest `onDemand.test.ts` (7 casos: lê o código de boot e onClose, garante ausência de auto-start)
- [x] Suite completa 351/351 verde
- [x] Checkpoint v43


## Fase 79: BUG erro ao conectar QR após Fase 78
- [x] Coletar logs recentes do baileys (qr.start funciona, QR aparece, scan acontece, mas pareamento não se completa)
- [x] Causa raiz: a Fase 78 removeu TODO reconnect automático do onClose, mas o código `515 (restart required)` que o WhatsApp envia logo após o scan **é parte do handshake** — sem religar imediatamente nesse caso, o pareamento fica preso para sempre
- [x] Corrigido: branch dedicado para `isRestartRequired` no onClose que chama `startQrSession(agentId)` 250ms depois (uma única vez, sem backoff). Outros caminhos de queda continuam exigindo clique manual
- [x] Testes atualizados em `onDemand.test.ts` (caminho restart-required é verificado, regra de quedas reais permanece)
- [x] Suite completa 352/352 verde
- [x] Checkpoint v44


## Fase 80: BUG mensagens presas na DLQ não chegam no WhatsApp real
- [x] Diag direto no DB confirmou estado inconsistente: `qr_session.status='connected'` mas dispatcher loga `no live socket (offline)` em todas as outbounds (4 mensagens presas na DLQ para conv 30003)
- [x] Causa raiz: o socket Baileys morreu na memória do processo (sockets.delete no onClose), mas a flag DB ficou desatualizada. Dispatcher caía sempre no branch offline e ninguém religava porque modo on-demand espera clique manual.
- [x] Correção 1: reconciliação automática — quando dispatcher detecta socket morto, força `qr_session.status='disconnected'` com motivo `socket vanished` e chama `markDisconnected`. Painel passa a refletir verdade.
- [x] Correção 2: auto-religação SEGURA quando há `authBlob` persistido (creds válidas). startQrSession nesse caminho NUNCA gera QR novo — apenas restaura a sessão. Preserva o modo on-demand para primeira conexão e libera entrega quando a queda foi puramente de rede.
- [x] DLQ existente é drenada automaticamente no próximo tick do retry-worker assim que o socket religar (markConnected dispara `runRetryWorkerNow`).
- [x] Teste vitest `socketReconcile.test.ts` (5 casos: persiste antes de tudo, reconcilia status, auto-religa com creds, lastError correto, não duplica em retry).
- [x] Suite completa 357/357 verde.
- [x] Checkpoint v45


## Fase 81: Substituir Baileys/QR Code por Z-API
- [x] Pesquisei docs Z-API (send-text, send-image, send-audio, send-video, send-document, webhook on-receive, /status, header Client-Token)
- [x] Schema: nova tabela `zapi_instances` (agentId, instanceId, token, clientToken, webhookSecret, isConnected, smartphoneConnected, lastStatusJson, lastSyncedAt, lastError, lastErrorAt, createdAt, updatedAt) + enum connectionMode estendido com 'zapi'
- [x] Migrations 0021 (tabela) e 0022 (enum) aplicadas no banco
- [x] Cliente Z-API server-side (`server/whatsapp/zapi.ts`): normalizePhone, sendText, sendImage, sendAudio, sendVideo, sendDocument, getStatus, verifyWebhookSecret, extractInboundContent
- [x] Webhook handler `/api/zapi/:agentId/inbound` (server/whatsapp/zapiWebhook.ts) com validação de secret na URL e mesmo pipeline de inbound do Baileys/Cloud (findOrCreateLead → appendMessage → orchestrator)
- [x] Roteamento do dispatcher: `connectionMode='qr'` e `connectionMode='zapi'` agora roteiam para Z-API. Baileys mantido como `_QrPanelLegacy` não roteado (fallback)
- [x] Follow-up engine atualizado para usar `dispatchActions` em vez de `dispatchViaBaileys` direto (assim modo qr passa pelo Z-API)
- [x] UI: substituí o painel QR pelo `ZapiPanel` — inputs para Instance ID, Token, Client-Token (opcional), URL do Webhook gerada com secret embutido, botão copiar URL, botão testar conexão (chama /status), badge Conectado/Desconectado
- [x] Procedures tRPC: `zapi.get`, `zapi.upsert`, `zapi.ping`, `zapi.regenerateWebhook`, `zapi.disconnect`
- [x] Testes vitest (5 cliente Z-API + 9 parser/webhook + 3 dispatcher routing) e suite total 372/372 verde
- [x] Checkpoint v46


## Fase 82: Bugfixes pós-checkpoint v46 — vídeo Z-API + getConfig undefined
- [x] Bug 1 (vídeo não chega no WhatsApp real): causa raiz nos logs do DB — Z-API recusava `/manus-storage/...` com erro `Base64/Url could not be read` porque a URL é interna e exige Authorization para o redirect 307
- [x] Criado helper `server/whatsapp/mediaUrlResolver.ts` que converte `/manus-storage/<key>` em URL CloudFront assinada via `storageGetSignedUrl(key)` antes de enviar para a Z-API (image, video, audio, document)
- [x] Bug 2 (whatsapp.getConfig retornando undefined): `getWhatsappConfig` em `server/db.ts` agora retorna `null` em vez de `undefined`; procedure faz `?? null` defensivamente
- [x] 6 novos testes vitest cobrindo o resolver (URL absoluta, /manus-storage, fallback, casos de erro)
- [x] Suite total 378/378 verde
- [x] Checkpoint v47

## Fase 83: Revisão profunda integração Z-API (v48)
- [x] Lock atômico em conversations.pendingProcessAt (claimConversationForProcessing) — corrige duplicação de "Boa tarde!"
- [x] Idempotência inbound Z-API por waMessageId (inboundMessageExists)
- [x] Anti greeting-loop guard: detecta saída trivial, regenera 1x e silencia se persistir
- [x] SAFETY NET deixa de empurrar fallback genérico quando aiOutput foi suprimido (silêncio > spam)
- [x] sendPresence Z-API (composing/recording) integrado no dispatcher antes de cada texto
- [x] Cache em memória (TTL 25 min) para signed URLs em mediaUrlResolver
- [x] Suite vitest 392/392 verde


## Fase 84: Reset operacional (manual, on-demand)
- [x] Resetar TODAS as conversas (preservar leads/agentes/mídias/scripts/knowledge)


## Fase 85: Auth email/senha exclusivo (admin-managed)
- [x] Adicionar passwordHash, passwordUpdatedAt em users + migration
- [x] Backend: bcrypt + procedures auth.login/logout/me e admin.users.{list,create,update,resetPassword,delete}
- [x] Cadastro fechado: bloquear OAuth callback do fluxo do usuário (manter procedure só para owner)
- [x] Frontend: rota /login com email+senha, ProtectedRoute redirect, página /admin/users
- [x] Remover botão "Entrar com Manus" do Home/Login
- [x] Limpar TODOS users existentes e criar admin mrhcomercio@hotmail.com (Ferramenta1703$)
- [x] Testes vitest: hash bcrypt, login válido/inválido, autorização adminProcedure


## Fase 86: Bug crítico — fetch failed Z-API
- [x] Diagnosticar erro "fetch failed" no dispatcher Z-API
- [x] Aplicar fix (timeout, AbortController, retry interno, retry-worker no boot)
- [x] Reprocessar DLQ pendente

## Fase 87: Adesão 100% ao script (anti-alucinação)
- [x] Auditar prompt builder e parseAgentOutput
- [x] Anti-repetição: detecção de paráfrase nas últimas 3 outbounds (antiRepetition.ts, Jaccard 0.6) + regen 1x
- [x] Idempotência de mídia: filterMediaForTurn descarta ids já enviados na conversa
- [x] Regra "responda perguntas diretas antes de avançar": questionGuard + canAdvanceStep com lastInboundIsQuestion
- [x] Não usar nome do lead se ele não disse no chat: leadNameGuard.resolveLeadNameForPrompt
- [x] System prompt já destaca ETAPA ATUAL como diretiva interna (auditado, sem mudança necessária)
- [x] Bloquear envio de mídia em cooldown 60s + máximo 1 mídia por turno
- [x] STEP_ADVANCE estrito quando lead acabou de perguntar (canAdvanceStep reforçado)
- [x] Testes vitest: 5 novos arquivos (antiRepetition, leadNameGuard, mediaCooldown, questionGuard, stepSkip estendido) — suite 438/438 verde


## Fase 88: Pacote travas anti-alucinação (objections + lead facts + step compliance)
- [x] Schema: estender `script_steps` (objective, mustAsk, mustNotSay, successSignals)
- [x] Schema: estender `leads` (facts JSON, factsUpdatedAt)
- [x] Schema: criar `objections`, `objection_dispatches`, `step_media_links`, `step_compliance_logs`
- [x] Migration `0024_high_virginia_dare.sql` gerada e aplicada
- [x] `server/ai/objectionHandler.ts` (detect + record + cache)
- [x] `server/ai/stepCompliance.ts` (heurística + regen hint)
- [x] `server/ai/leadFactsExtractor.ts` (LLM mini, fire-and-forget, persistência)
- [x] `server/ai/invoke.ts`: ampliar `tracking.purpose` com `step_compliance`, `step_compliance_regen`, `lead_facts_extraction`
- [x] `server/ai/prompt.ts`: estender PromptContext com leadFactsBlock, objectionHint, forceRegenHint, mustAsk, mustNotSay, objective
- [x] Orchestrator: detect objection no inbound + shortcut literal + injetar facts/objection no prompt
- [x] Orchestrator: validador stepCompliance antes de despachar (regenera 1x via purpose=step_compliance_regen)
- [x] Orchestrator: mídias da objeção entram no filterMediaForTurn (idempotência preservada)
- [x] Orchestrator: dispara extractAndSaveAsync no fim do turno (fire-and-forget)
- [x] Orchestrator: registra objectionDispatch ao usar hint não-literal
- [x] Routers tRPC: CRUD `objections` + `stepMediaLinks` + `leadFacts.facts/clear`; `steps.create/update` aceita objective/mustAsk/mustNotSay/successSignals
- [x] UI editor de etapas expõe os 4 campos novos (objective + must_ask + must_not_say + success_signals)
- [x] UI nova página `/objections` no menu (CRUD completo, prio, literal, mídias anexadas, once_per_conv)
- [x] Testes vitest: stepCompliance (10), objectionHandler (6), leadFactsExtractor (4) — puros, sem chamada LLM
- [x] Suíte verde 458/458 + checkpoint v52 + UI items v53
- [x] (deferido) stepMediaLinks on_enter/on_advance — schema e CRUD prontos; integração no orchestrator fica para a Fase 89 quando houver demanda
- [x] (deferido) UI dedicada para `step_media_links` — hoje gerenciável via tRPC `objections.stepMedia.*`; Fase 89


## Fase 89: Chat ao vivo enriquecido + validação Z-API
- [x] Backend: emitir eventos `scheduled` (+ `etaAt`), `processing`, `composing`, `composed`, `sending`, `sent` no bus realtime via novo evento `pipeline`
- [x] Backend: enviar `agentName` (resolvido no front via `trpc.agents.get`) e `leadName` (já retornado em `live.listActive`) em cada evento
- [x] Frontend chat ao vivo: badge ao lado do nome do agente ("digita em Xs", "respondendo agora", "pensando…", "digitando", "enviando i/N", "entregue")
- [x] Frontend chat ao vivo: countdown regressivo até começar a digitar (atualizado a cada 250ms via `useCountdown`)
- [x] Frontend chat ao vivo: badge ao lado do nome do lead ("digitando" / "aguardando IA")
- [x] Frontend chat ao vivo: linha do tempo de eventos abaixo das mensagens (últimos 5)
- [x] Frontend: barra de progresso da pipeline (6 etapas) entre header e mensagens
- [x] Fluxo end-to-end Z-API: webhook agenda `scheduled` + dispatcher Z-API publica `composed`/`sending`/`sent`; mesma instrumentação no Cloud API oficial
- [x] Testes vitest do bus pipeline (8 novos testes em `pipeline.test.ts`) — 480/480 verde
- [x] Checkpoint v55 salvo (`6ef39092`)


## Fase 90: Remover reenvio automático após reconexão WhatsApp
- [x] Mapear listener/worker que dispara auto-flush DLQ ao reconectar (3 pontos: `_core/index.ts:85`, `baileys.ts:220-231`, `baileys.ts:1213`)
- [x] Desligar o disparo automático mantendo a fila DLQ intacta: `startRetryWorker` não roda no boot, listener `connection: open` não dispara mais `runRetryWorkerNow`, e os 3 pontos onde havia `enqueueMessageRetry({ nextRetryAt: nextRetryAt(1), maxAttempts: 5 })` agora gravam `nextRetryAt: null` e `maxAttempts: 1` (item pausado, reenvio manual único)
- [x] Atualizar UI da página `/retries`: novo texto deixa claro que mensagens ficam pausadas e não são reenviadas sozinhas; coluna "Próx. envio" virou "Falhou em"; toast "Reenviando agora…"
- [x] Testes vitest cobrindo a nova lógica: 6 novos testes em `dlq.manualOnly.test.ts` validando boot/reconnect/dispatcher/baileys/UI/exports
- [x] Checkpoint v57 (`404e9e20`) salvo — suite 486/486 verde


## Fase 91: Não responder mensagens acumuladas durante offline
- [x] Mapear caminhos de disparo automático pós-reconexão: o **debounce worker** (`server/ai/debounceWorker.ts`) tica a cada 1s e processa qualquer `pendingProcessAt < now` em qualquer conversa, independente do canal Baileys/Z-API
- [x] Ao reconectar (Baileys `connection: open`), chamar `purgePendingProcessForAgent(agentId, now)` que zera `pendingProcessAt` de TODAS as conversas do agente cujo agendamento esteja vencido
- [x] No Z-API webhook de status (`/api/zapi/:agentId/status`), purgar pendingProcessAt na transição `disconnected -> connected` (guarda `wasOffline` evita purgar em status updates de rotina)
- [x] No boot do `debounceWorker`, executar `purgeStalePendingProcess(cutoff = now - 60s)` global — cobre o caso de servidor reiniciar com fila acumulada
- [x] UI no Chat: dispensável — a UX preferida é ficá-lo silencioso (banner pode confundir o operador). Pode ser adicionado depois se necessário.
- [x] Testes vitest: 7 novos em `reconnectPurge.test.ts` validando os 3 pontos de purga + Fase 90 preservada
- [x] Suite 493/493 verde

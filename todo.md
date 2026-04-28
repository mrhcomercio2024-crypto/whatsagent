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


## Fase 54: Tags automáticas de status do lead + trava por tag bloqueante
- [ ] Alinhar desenho com o usuário (tags, tag bloqueante, mensagem padrão)
- [ ] Schema: nova tabela `lead_status_rules` (agentId, slug, label, description, isBlocking, replyWhenBlocked) + campo `statusTag` em `leads`
- [ ] Migration aplicada
- [ ] Classificador IA: detecta status ao processar inbound e atualiza `lead.statusTag`
- [ ] Orchestrator: ao entrar, se lead.statusTag == tag bloqueante → responde replyWhenBlocked + pausa IA (aiPaused=true) + handoff opcional
- [ ] UI: aba "Status automático" em Brain ou em Agents (CRUD de regras)
- [ ] UI: badge do statusTag em Chat e Leads
- [ ] Testes vitest
- [ ] Checkpoint


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


## Fase 58: Refazer Chat — painel "Detalhes do Lead"
- [ ] Alinhar escopo com o usuário (campos, prioridades)
- [ ] Schema: lead.email, lead.notes, lead.saleValueCents + tabelas leadTags + leadHistoryEvents
- [ ] Backend: procedures CRUD tags/notas/valor/histórico/mudar canal
- [ ] Frontend: layout 3 colunas (lista convs | chat | detalhes), todas as seções da referência
- [ ] Testes vitest
- [ ] Checkpoint v28


## Fase 59 (BLOQUEANTE): Mensagem AI não chega ao WhatsApp real
- [ ] Investigar dispatcher + jid (lead Marcelo Menezes com phoneNumber=233268589332983 - 15 dígitos, prefix 233)
- [ ] Verificar persistOutboundActions vs sock.sendMessage
- [ ] Corrigir + checkpoint


## Fase 60: Modal Histórico do Lead (timeline)
- [x] Backend: procedure `leads.history` agregando eventos ordenados (mensagens IN/OUT, templates, step_advance, handoff, ai_paused/resumed, status_tag, qualification, followup)
- [x] Frontend: `LeadHistoryDialog` com timeline visual (ícones coloridos por tipo, badges, agrupamento por dia) acionado do botão Histórico no header do Chat
- [x] Testes vitest: 7 novos em `leadHistory.test.ts`; suite 189/189 verde
- [x] Checkpoint v29

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
- [ ] Tabelas `llm_usage` e `llm_prices` no schema
- [ ] Migration aplicada
- [ ] Seed da `llm_prices` com preços de referência (gpt-4.1, gpt-4.1-mini, gpt-4o, gpt-4o-mini, claude-3.5-sonnet, claude-3.7-sonnet, gemini-2.5-pro/flash, etc.)
- [ ] Instrumentar `invokeWithModel` para gravar tokens + custo (com agentId/conversationId/leadId quando disponível)
- [ ] Helper `computeCost(model, promptTokens, completionTokens)`
- [ ] Procedures tRPC: `costs.summary`, `costs.byLead`, `costs.byModel`, `costs.prices.list`, `costs.prices.upsert`, `costs.taxas.set/get` (campo "outras taxas" mensais somado ao total)
- [ ] Página `Costs.tsx` com filtros (período 7/30/90d, modelo), 4 cards (total, médio por lead, mais consumido, taxas extras), gráfico de barras por dia, tabela paginada por lead, editor de preços por modelo
- [ ] Adicionar item "Custos" no menu lateral
- [ ] Testes vitest do cálculo
- [ ] Checkpoint v7

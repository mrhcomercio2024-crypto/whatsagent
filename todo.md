# WhatsAgent — TODO

## Fase 1: Setup & Design System
- [x] Inicializar projeto webdev (web-db-user)
- [ ] Definir paleta elegante (dark sofisticado), tipografia premium e tokens em index.css
- [ ] Configurar fontes Google (Inter + serif de display) no index.html

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
- [ ] Endpoint webhook GET/POST /api/whatsapp/webhook (verificação + recebimento)
- [ ] Cliente Meta Cloud API: enviar texto, imagem, vídeo, template
- [ ] Motor de IA: orquestrador (cérebro + etapa atual + RAG + memória)
- [ ] Seleção de LLM por etapa (lista completa de modelos disponíveis)
- [ ] Detector de gatilhos de mídia (palavra-chave, etapa, decisão IA)
- [ ] Avanço automático de etapas baseado em critérios
- [ ] Qualificação automática de lead (quente/morno/frio) via análise IA
- [ ] Detector de palavras-chave de handoff → pausar IA + notificar
- [ ] Verificação de horário de atendimento + envio de mensagem fora do horário

## Fase 4: Follow-up Engine
- [ ] Cron/scheduler para varrer followup_jobs pendentes
- [ ] Cálculo da janela 24h por conversa
- [ ] Decisão automática: dentro da janela = livre, fora = template
- [ ] Override manual via UI (forçar template ou forçar livre)
- [ ] Geração de mensagem por IA OU mensagem fixa, conforme regra
- [ ] Endpoint manual para acionar follow-up sob demanda

## Fase 5: Painel — Configurações
- [ ] Layout dashboard com sidebar elegante
- [ ] Página: Lista e edição de Agentes (multi-agente)
- [ ] Página: Cérebro do Agente (prompt mestre + regras + tom)
- [ ] Página: Etapas do Script (ordem, instruções, LLM por etapa, critérios)
- [ ] Página: Base de Conhecimento (RAG) com upload e CRUD
- [ ] Página: Biblioteca de Mídias (upload imagem/vídeo + gatilhos)
- [ ] Página: Templates WhatsApp aprovados
- [ ] Página: Regras de Follow-up (intervalos, tentativas, com/sem template)
- [ ] Página: Conexão WhatsApp Cloud API (credenciais Meta)
- [ ] Página: Configurações Operacionais (horário, mensagem fora horário, handoff)

## Fase 6: Painel — Operação
- [ ] Inbox em tempo real (lista conversas + chat)
- [ ] Botão "Pausar IA" e "Assumir conversa"
- [ ] Filtros por temperatura, etapa, status
- [ ] Detalhes do lead: histórico, tags, etapa, temperatura
- [ ] Simulador interno (chat sem WhatsApp real)
- [ ] Dashboard de métricas (cards + gráficos)
- [ ] Exportação CSV (leads e conversas)

## Fase 7: Testes & Polimento
- [ ] Vitest: motor de IA monta prompt corretamente
- [ ] Vitest: detector de gatilhos
- [ ] Vitest: lógica janela 24h e decisão template/livre
- [ ] Vitest: qualificação de lead
- [ ] Polimento visual
- [ ] webdev_check_status final

## Fase 8: Documentação Self-Hosted
- [ ] README.md com instruções completas
- [ ] Guia de configuração Meta Cloud API
- [ ] Guia de deploy self-hosted
- [ ] Lista de variáveis de ambiente
- [ ] Guia de uso da ferramenta

## Fase 9: Entrega
- [ ] Salvar checkpoint
- [ ] Criar repositório GitHub privado
- [ ] Mensagem final ao usuário

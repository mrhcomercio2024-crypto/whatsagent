# WhatsAgent — Guia completo de Self-Hosting

> Plataforma de Agente de IA para atendimento via WhatsApp Cloud API oficial (Meta).
> Stack: **Node.js 22 · React 19 · tRPC 11 · Drizzle ORM · MySQL/TiDB · Tailwind 4**.

Este guia ensina, do zero ao ar, como rodar o WhatsAgent no seu próprio servidor, conectar ao WhatsApp Business API oficial e operar a ferramenta no dia a dia.

---

## 1. Visão geral da arquitetura

A plataforma é composta por:

| Camada | Tecnologia | Responsabilidade |
|---|---|---|
| Frontend | React 19 + Tailwind 4 + shadcn/ui | Painel administrativo (cérebro, etapas, mídias, inbox, simulador, métricas) |
| Camada de API | tRPC 11 sobre Express 4 | Procedures tipadas end-to-end consumidas pelo painel |
| Motor de IA | OpenAI-compatible (GPT-4.1, GPT-4o, Claude, Gemini, etc.) | Decide a próxima ação do agente em cada turno da conversa, respeitando o cérebro, a etapa atual e a base de conhecimento |
| Integração WhatsApp | Webhook + Graph API v20 | Recebe mensagens da Meta, envia texto/imagem/vídeo/template |
| Engine de follow-up | Loop em background (interval 60s) | Agenda e dispara follow-ups conforme regras configuradas |
| Persistência | MySQL 8 ou TiDB | 16 tabelas: agentes, cérebro, etapas, conhecimento, mídias, gatilhos, leads, conversas, mensagens, regras e jobs de follow-up, templates HSM, horários, palavras-chave de handoff, métricas |
| Storage | S3-compatível ou disco local | Armazena imagens e vídeos enviados ao lead |

Todo o fluxo é **stateless do lado da Meta**: a Meta entrega o webhook, o WhatsAgent processa, decide e responde via API. Nada na ferramenta exige infraestrutura proprietária da Manus — o código é totalmente seu.

---

## 2. Pré-requisitos

Antes de instalar, providencie:

1. **Servidor Linux** com Node.js **22 ou superior** e `pnpm` instalados.
2. **Banco MySQL 8** ou **TiDB** acessível pelo servidor.
3. **HTTPS público** (a Meta só aceita webhooks com TLS válido). Use Cloudflare, Caddy, Nginx + Let's Encrypt ou um proxy gerenciado.
4. **Conta Meta for Developers** com:
   - Um **App** do tipo Business.
   - Um **WhatsApp Business Account (WABA)** conectado ao app.
   - Um **número de telefone aprovado** no WABA (obtenha o `phoneNumberId` e o `businessAccountId`).
   - Um **System User Token de longa duração** (`accessToken`).
5. **Provedor LLM** compatível com a API OpenAI (chave + URL base). A interface aceita qualquer modelo declarado em `shared/llm-models.ts`.

---

## 3. Instalação

```bash
git clone <seu-repo>/whatsagent.git
cd whatsagent
pnpm install
```

Crie um arquivo `.env` na raiz com as variáveis listadas na seção 4. Em seguida, gere e aplique o esquema:

```bash
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

Para desenvolvimento:

```bash
pnpm dev
```

Para produção:

```bash
pnpm build
pnpm start
```

O servidor responde em `http://localhost:3000` por padrão. Coloque-o atrás de Nginx/Caddy com HTTPS antes de expor à internet.

---

## 4. Variáveis de ambiente

Estas são as variáveis lidas pela aplicação (arquivo `server/_core/env.ts`). Tabela de referência rápida também em [`ENV_VARIABLES.md`](./ENV_VARIABLES.md):

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | sim | String de conexão MySQL/TiDB (ex.: `mysql://user:pass@host:3306/whatsagent`) |
| `JWT_SECRET` | sim | Segredo usado para assinar cookies de sessão |
| `BUILT_IN_FORGE_API_URL` | sim | URL base do provedor LLM (compatível OpenAI). Ex.: `https://api.openai.com/v1` |
| `BUILT_IN_FORGE_API_KEY` | sim | Bearer token do provedor LLM |
| `VITE_APP_ID` / `OAUTH_SERVER_URL` / `VITE_OAUTH_PORTAL_URL` | opcional | Necessárias se você quiser manter o login via Manus OAuth. Para login próprio, substitua a camada de auth em `server/_core`. |
| `OWNER_OPEN_ID` / `OWNER_NAME` | opcional | Identificam o usuário que assume o papel `admin` no primeiro login |

> As credenciais do WhatsApp Cloud API **não** ficam em variáveis de ambiente: elas são salvas por agente, dentro do banco, na tela `WhatsApp` do painel. Isso permite múltiplos agentes com números distintos.

---

## 5. Conectando o WhatsApp Cloud API oficial

No painel da Meta:

1. Acesse **developers.facebook.com → seu App → WhatsApp → API Setup** e copie:
   - `Phone number ID`
   - `WhatsApp Business Account ID`
   - **System user access token** (gere um permanente em *Business Settings → Users → System users*).
   - **App secret** (em *App settings → Basic*) — usado para validar assinaturas do webhook.
2. No WhatsAgent, abra **Agentes → criar** e em seguida acesse **WhatsApp**:
   - Cole `Phone number ID`, `Business account ID`, `Access token`, `App secret`.
   - Defina um **Verify token** qualquer (ex.: `wa_verify_42`) — anote, será exigido pela Meta na próxima etapa.
   - Salve.
3. Volte à Meta em **WhatsApp → Configuration → Webhook → Edit**:
   - **Callback URL**: `https://SEU-DOMINIO/api/whatsapp/webhook/<AGENT_ID>` (o painel exibe a URL exata).
   - **Verify token**: o mesmo definido acima.
   - Após verificar, **assine os eventos** `messages` e `message_template_status_update`.
4. Envie uma mensagem ao número do WABA pelo seu WhatsApp pessoal — em segundos a conversa aparecerá no **Inbox** e o agente começará a responder seguindo o cérebro configurado.

---

## 6. Configurando o agente passo a passo

### 6.1. Cérebro
Em **Cérebro**, descreva persona, tom, regras inegociáveis, lista de produtos/serviços, objeções comuns e informações da empresa. Esse texto é injetado em todos os prompts do agente. Quanto mais específico e estruturado, mais o agente segue à risca.

### 6.2. Etapas do script
Em **Etapas**, defina a sequência obrigatória do atendimento (saudação → qualificação → apresentação → fechamento). Para cada etapa:

- **Instruções** que o agente deve seguir naquela etapa.
- **Critério de conclusão** (texto natural — usado pela IA para decidir quando avançar).
- **LLM dedicado** (opcional). Se vazio, usa o modelo padrão do agente. Você pode usar um modelo barato para qualificação e um modelo premium para fechamento.

### 6.3. Base de conhecimento (RAG)
Em **Conhecimento**, cadastre blocos de texto (FAQ, política comercial, descrições de produto). A cada turno, o agente seleciona os blocos mais relevantes para a mensagem do lead e os injeta no prompt — evita alucinação.

### 6.4. Mídias e gatilhos
Em **Mídias**, faça upload de imagens e vídeos. Para cada mídia, crie um ou mais **gatilhos**:

- **Por palavra-chave** — dispara quando o lead enviar termos como `preço`, `tabela`, `endereço`. Suporta lista separada por vírgula, ignora acentos e maiúsculas.
- **Por etapa** — envia automaticamente ao chegar numa etapa específica.
- **Decisão da IA** — a mídia é descrita no prompt e o modelo decide se envia ou não conforme a conversa.

A flag *"Enviar uma vez por conversa"* impede repetição.

### 6.5. Operação
Em **Operação**:
- **Horário de atendimento** com fuso e janelas por dia da semana. Fora do horário, o agente responde com a mensagem pré-definida.
- **Palavras-chave de handoff** (`atendente`, `humano`, etc.) — assim que detectadas, a IA pausa, a conversa entra em status `human_handoff` e aguarda atendimento manual no Inbox.

### 6.6. Templates HSM
Em **Templates**, cadastre os templates aprovados pela Meta (nome, idioma, categoria, corpo, variáveis). São usados para mensagens fora da janela de 24h.

### 6.7. Follow-ups
Em **Follow-ups**, crie quantas regras quiser, cada uma com:

- **Atraso em minutos** sem resposta do lead.
- **Origem da mensagem**: texto fixo, gerada pela IA contextualmente, ou conteúdo de template.
- **Política de janela 24h**:
  - `auto` — usa mensagem livre se a conversa estiver dentro de 24h, senão usa o template definido.
  - `force_free` — só dispara dentro de 24h.
  - `force_template` — sempre via template aprovado (recomendado para reengajamento após dias de silêncio).
- **Cancelar se o lead responder antes**.

A engine roda em background a cada 60 segundos e processa todos os jobs pendentes.

---

## 7. Operação no dia a dia

- **Inbox** mostra todas as conversas em tempo real, com indicação de IA pausada, handoff e fechamento. Ao clicar em **Pausar IA**, você assume e responde manualmente. Ao **Retomar**, a IA volta a atender.
- **Leads** lista todos os contatos qualificados automaticamente como quente / morno / frio. Edite manualmente, adicione tags e exporte tudo em CSV.
- **Simulador** envia mensagens diretamente ao motor sem tocar no WhatsApp real — ideal para testar mudanças no cérebro, etapas ou gatilhos.
- **Dashboard** consolida métricas dos últimos 30 dias: leads, conversas, mensagens, tempo médio de resposta da IA, distribuição por temperatura, follow-ups disparados e handoffs.

---

## 8. Múltiplos agentes

Cada agente tem cérebro, etapas, mídias, follow-ups, horários e número WhatsApp próprios. O seletor de agente fica no topo da sidebar. Use múltiplos agentes para separar produtos, marcas ou idiomas, sempre com o mesmo painel.

---

## 9. Estrutura de pastas relevante

```
client/                     ← Painel React
  src/
    pages/                  ← Telas (Brain, Steps, Media, Followups, Inbox, ...)
    components/AppLayout    ← Sidebar e estrutura geral
    contexts/AgentContext   ← Agente selecionado
server/
  ai/
    orchestrator.ts         ← Decide a resposta a cada mensagem do lead
    prompt.ts               ← Monta o prompt mestre + RAG + memória
    triggers.ts             ← Casamento por palavra-chave / etapa
    qualifier.ts            ← Qualificação automática quente/morno/frio
    timing.ts               ← Janela 24h e horário de atendimento
  whatsapp/
    client.ts               ← Cliente Graph API (texto, mídia, template)
    dispatcher.ts           ← Distribui ações para o WhatsApp
    webhook.ts              ← Endpoint /api/whatsapp/webhook/:agentId
  followup/engine.ts        ← Loop de processamento dos jobs
  routers.ts                ← Procedures tRPC consumidas pelo painel
  db.ts                     ← Helpers Drizzle de leitura/escrita
drizzle/schema.ts           ← Schema do banco
shared/llm-models.ts        ← Catálogo de modelos disponíveis no painel
```

---

## 10. Customizações comuns

| Necessidade | Onde mexer |
|---|---|
| Adicionar um novo provedor LLM | `shared/llm-models.ts` (adicione o modelo) e, se a URL/auth diferirem, `server/ai/invoke.ts` |
| Trocar a autenticação para SSO próprio | `server/_core/oauth.ts` e `server/_core/context.ts` |
| Persistir mídias em outro storage (S3/GCS/MinIO) | `server/storage.ts` |
| Adicionar webhooks externos (CRM, Slack) | criar uma chamada `fetch` em `server/whatsapp/dispatcher.ts` ou em `server/ai/orchestrator.ts` |
| Mudar o intervalo do engine de follow-up | `server/followup/engine.ts` (constante de tempo) |

---

## 11. Boas práticas operacionais

1. **Templates aprovados antes de qualquer reengajamento >24h**. Sem isso, a Meta bloqueia o envio.
2. **Cérebro versionado em git** — copie o conteúdo do campo periodicamente para um arquivo no repo.
3. **Monitore o consumo de LLM** por agente; etapas de qualificação podem usar modelos econômicos.
4. **Backup diário** do MySQL — ele guarda histórico de mensagens, leads e métricas.
5. **Rate limiting**: a Meta tem limites por nível do número (250/1k/10k/100k conversas/dia). Aumente o tier antes de campanhas de massa.

---

## 12. Solução de problemas

| Sintoma | Causa provável |
|---|---|
| Webhook não verifica | URL pública sem HTTPS válido, ou `verify token` divergente entre Meta e painel |
| Mensagens recebidas mas IA não responde | Agente em status `paused` ou conversa com `aiPaused = true` no Inbox |
| Follow-up não dispara | Regra `isActive=false`, política `force_free` com janela fechada, ou nenhum template aprovado vinculado |
| LLM retorna 401 | Verifique `BUILT_IN_FORGE_API_KEY` e a URL base — formatos diferentes para OpenAI/Azure/Anthropic |
| Mídia não envia | Storage URL inacessível publicamente ou MIME inválido |

---

## 13. Roadmap sugerido (próximas evoluções)

- Embeddings na base de conhecimento (atualmente RAG por keyword overlap).
- Integração nativa com CRMs (HubSpot, RD Station, Pipedrive).
- Métricas de funil por etapa do script.
- Multi-atendente com fila e SLA de handoff.

---

## 14. Licença e crédito

O código é seu — distribua, modifique e hospede livremente dentro da sua organização. Construído com cuidado para parecer humano.

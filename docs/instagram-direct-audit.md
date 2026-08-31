# Auditoria de arquitetura — Ravi + Instagram Direct oficial

**Autor:** Manus AI  
**Data:** 31 de agosto de 2026  
**Meta App obrigatório:** `Dashboard Marcelo` — App ID `2533423037090142`  
**Status:** auditoria concluída antes de alterações funcionais.

## Resumo executivo

O sistema já possui quase todo o núcleo necessário: CRM de leads, conversas e mensagens; Ravi Core com cérebro, etapas, memória, objeções, fatos e mídia; webhooks; adaptadores de transporte; handoff humano; autenticação administrativa; métricas; checkout e painel operacional. **O Instagram deve entrar como adaptador de canal**, não como outro agente. O principal trabalho estrutural é remover três suposições ainda específicas do WhatsApp: lead identificado obrigatoriamente por telefone, uma única conversa por agente/lead sem dimensão de canal e mensagem com identificadores `wa*`.

A implantação recomendada para o MVP é **OAuth oficial + Webhook no hosting Autoscale atual**, sem polling. O fluxo é orientado a eventos: a Meta envia a DM ao endpoint HTTPS, o backend valida a assinatura, deduplica o MID, associa uma identidade multicanal ao lead, persiste a mensagem, aciona o mesmo Ravi Core e o dispatcher seleciona o Instagram Adapter pela coluna `conversation.channel`. O caminho atual de WhatsApp permanece como default e não será substituído.

## Opções de implantação

| Abordagem | Trade-offs | Custo | Complexidade |
| --- | --- | --- | --- |
| **OAuth oficial + Webhook no hosting atual** | Atende integralmente ao botão “Conectar Instagram”, tokens long-lived, Webhook e painel. Pode haver cold start após inatividade, mas não exige infraestrutura nova. | Uso sob demanda; opção mais econômica e gratuita para começar dentro da franquia do projeto. | Média |
| **Token long-lived manual + Webhook** | É a alternativa mais leve para provar uma DM, porém exige colar/renovar token manualmente e não entrega a experiência OAuth solicitada. | Mesmo custo sob demanda. | Baixa |
| **OAuth oficial + instância reservada** | Elimina cold start e mantém um processo contínuo, útil apenas se a latência real do MVP justificar. | Uso medido, até **US$ 37,50/mês** em utilização contínua, menos US$ 10 de crédito mensal; tráfego é adicional. | Média |

O requisito do usuário já seleciona a primeira abordagem. Não há justificativa técnica para ativar a opção reservada antes de medir o MVP.

## A. O que já existe

| Componente | Situação atual | Evidência arquitetural |
| --- | --- | --- |
| Agente/Ravi Core | Um agente ativo (`Ravi teste`, ID 1) com cérebro, prompt mestre, etapas, RAG, objeções, fatos, score, mídia e proteção contra repetição. | `agents`, `agent_brain`, `script_steps`, `knowledge_base`, `objections`, `lead.facts`; `server/ai/orchestrator.ts` |
| CRM | 22 leads, 22 conversas e 12.372 mensagens persistidas no banco auditado. | `leads`, `conversations`, `messages`; helpers em `server/db.ts` |
| Webhooks | Webhook oficial Meta/WhatsApp com verificação e HMAC; Webhook Z-API e eventos externos. | `server/whatsapp/webhook.ts`, `server/whatsapp/zapiWebhook.ts`, `server/external/webhook.ts` |
| Adaptadores | `dispatchActions` já separa Ravi Core do transporte e roteia Cloud API/Z-API. | `server/whatsapp/dispatcher.ts` |
| Handoff | Conversas possuem `aiPaused`, status `human_handoff` e operador; o chat atual já oferece assumir/devolver. | `conversations`, `client/src/pages/Live.tsx`, routers de conversa |
| Autenticação | Login administrativo email/senha, rotas protegidas e papel admin. | middleware/tRPC existente, `AppLayout` e páginas protegidas |
| Painel Operação | Sidebar atual com Dashboard, Chat, Leads, Simulador, SIMULADOR WHATSAPP e Custos. | `client/src/components/AppLayout.tsx` |
| Métricas/attribution | Eventos genéricos por agente/conversa; eventos externos; checkout e conversões do Ravi Web. | `metrics_events`, `external_events`, `public_simulator_conversions` |
| Segurança de secrets | Chave AES-256-GCM já disponível para cifrar dados sensíveis server-side. | `server/publicSimulator/push/crypto.ts`; `WEB_PUSH_ENCRYPTION_KEY` |

## B. O que será reutilizado

O Instagram reutilizará **sem copiar lógica** o agente ID 1, Ravi Core, cérebro, etapas, resumo de contexto, fatos do lead, objeções, score, media triggers, histórico, métricas e regras de handoff. Os registros principais continuarão em `leads`, `conversations` e `messages`; a nova tabela de identidade fará a ponte entre IGSID e lead, permitindo futura união Instagram/WhatsApp quando houver telefone ou email confiável.

O `appendMessage` continuará atualizando timestamps e emitindo eventos em tempo real. O debounce/orquestrador continuará processando o histórico inteiro. O dispatcher ganhará somente um branch inicial por `conversation.channel`; `whatsapp` será o default dos registros existentes, portanto os caminhos Cloud API e Z-API permanecem inalterados.

## C. O que será criado

| Estrutura | Finalidade |
| --- | --- |
| `instagram_integrations` | Configuração por agente, conta profissional conectada, token cifrado, expiração, scopes, estado do Webhook, últimas atividades e último erro sem secrets expostos. |
| `channel_identities` | Liga `leadId` a `channel + accountId + externalUserId`, guardando IGSID, username, display name e metadata. Evita usar IGSID falso no campo telefone e prepara unificação futura. |
| `instagram_webhook_events` | Guarda evento sanitizado, MID/event key, tipo, status, tentativa, timestamps e erro estruturado; deduplicação persistente. |
| `instagram_oauth_states` | Nonce one-time com expiração para impedir CSRF/replay no callback OAuth. |
| Colunas aditivas em `conversations` | `channel` com default `whatsapp` e `channelMetadata` JSON para origem/referral/ad attribution. |
| Colunas aditivas em `messages` | `channel` com default `whatsapp`, `providerMessageId` e `providerStatus`; os campos `wa*` atuais permanecem. |
| `server/instagram/*` | Cliente Meta, crypto/state, parser, banco, OAuth, Webhook, service/adapter, logs e router. |
| `client/src/pages/Instagram.tsx` | Status, conexão, health check, métricas, filtros, inbox, lead e handoff no design system atual. |

## D. Arquivos que serão alterados

| Tipo | Arquivos |
| --- | --- |
| Schema/migration | `drizzle/schema.ts`, nova migration `drizzle/0032_*.sql`, snapshots do Drizzle |
| Integração do backend | novos `server/instagram/client.ts`, `crypto.ts`, `db.ts`, `parser.ts`, `webhook.ts`, `oauth.ts`, `service.ts`, `router.ts`, `logger.ts` |
| Pontos compartilhados mínimos | `server/db.ts`, `server/whatsapp/dispatcher.ts`, `server/routers.ts`, `server/_core/index.ts` |
| Interface | novo `client/src/pages/Instagram.tsx`, `client/src/App.tsx`, `client/src/components/AppLayout.tsx` |
| Testes | novos testes em `server/instagram/*.test.ts` e ajustes de regressão apenas quando o contrato multicanal exigir |
| Documentação | `docs/instagram-direct-audit.md` e guia de configuração operacional |

Nenhuma alteração será feita no prompt comercial, produtos, preços, provas, SPIN, Ravi Web Lite, PWA, checkout ou Follow-up Engine, exceto o uso dos identificadores genéricos de canal quando tecnicamente indispensável.

## E. Migration

Haverá **uma migration estritamente aditiva**. Ela criará quatro tabelas e adicionará colunas com defaults compatíveis. Não haverá rename, drop, truncamento, backfill destrutivo ou exclusão de registros. Os 22 leads, 22 conversations e 12.372 mensagens atuais permanecem válidos; conversas/mensagens antigas assumem `channel = whatsapp`.

## F. Callback URL do Webhook

```text
https://agentedozap.com/webhooks/meta/instagram
```

O endpoint terá GET para `hub.challenge` e POST com corpo bruto, limite de tamanho, validação HMAC SHA-256 em tempo constante e ACK rápido. O registro ocorrerá antes do parser JSON global, evitando perda do raw body.

## G. OAuth Redirect URI

```text
https://agentedozap.com/api/instagram/oauth/callback
```

O botão autenticado solicitará ao backend uma URL com `state` assinado e nonce one-time. O callback validará assinatura, expiração, usuário/agente e consumo único antes de trocar o `code`.

## H. Verify Token

O Verify Token será armazenado como secret server-side em `META_INSTAGRAM_VERIFY_TOKEN`; não será mostrado no status operacional nem enviado ao frontend. Ele será usado exclusivamente para a verificação GET do Webhook. O valor deverá ser copiado uma única vez para o campo **Verify token** do Meta App Dashboard.

## I. Secrets/configurações necessárias

| Variável | Obrigatória | Origem/uso |
| --- | --- | --- |
| `META_APP_ID` | Sim | Valor fixo autorizado pelo usuário: `2533423037090142`. |
| `META_APP_SECRET` | Sim | Meta App Dashboard → App settings → Basic. Assina payloads e participa da troca OAuth. |
| `META_INSTAGRAM_VERIFY_TOKEN` | Sim | String secreta de alta entropia definida para a verificação do Webhook. |
| `META_GRAPH_API_VERSION` | Sim | `v26.0`, versão mais recente em 31/08/2026.[5] |
| Access Token | Obtido por OAuth | Não será solicitado em chat; será trocado por long-lived token e cifrado no banco. |
| Instagram Account ID/@username | Obtidos por API | Serão descobertos depois do OAuth e persistidos no backend. |

O connector Instagram já existente na sessão está desativado e é voltado à publicação de Posts/Stories/Reels; ele não será habilitado nem reutilizado para DMs. Esta integração pertence ao backend do produto.

## J. Configuração manual necessária no Meta App

| Etapa no `Dashboard Marcelo` | Ação |
| --- | --- |
| Instagram product | Confirmar **Instagram API with Instagram Login** no App ID `2533423037090142`; não criar outro App. |
| Business Login settings | Adicionar exatamente a OAuth Redirect URI informada acima. |
| Webhooks | Selecionar objeto Instagram, informar Callback URL e Verify Token e habilitar Include Values quando aplicável. |
| Campos | Priorizar `messages`; depois habilitar `messaging_postbacks`, `messaging_referral`, `messaging_seen` e `message_reactions` se estiverem disponíveis para este produto/app. |
| Permissões | Manter `instagram_business_basic` e `instagram_business_manage_messages`, já em Standard Access. |
| Conta de teste | Garantir que a conta profissional administrada pertença aos usuários/roles permitidos enquanto o App não usa Advanced Access. |
| Conexão | Após a publicação, clicar em **CONECTAR INSTAGRAM** dentro de OPERAÇÃO > INSTAGRAM e autorizar a conta correta. |
| Teste | Enviar “Boa noite” de outra conta, depois as quatro mensagens de contexto solicitadas, verificando Webhook, Ravi, Direct e inbox. |

## Segurança e regras operacionais

O token será cifrado em AES-256-GCM com a chave já gerenciada pelo servidor. O App Secret e Verify Token permanecerão em secrets de ambiente. O backend usará comparação constante para HMAC/state, rejeitará assinatura inválida antes de persistir, ignorará `is_echo = true`, criará índice único para MID e não aceitará agent/account IDs do navegador sem verificar ownership.

Mensagens só serão enviadas após interação do usuário e dentro da janela oficial de 24 horas. Tipos de anexo ainda não suportados serão persistidos com metadata e receberão uma resposta segura; o MVP de texto não será atrasado. Erros Meta guardarão HTTP status, code, subcode, mensagem sanitizada, conversation/account e timestamp, nunca token.[3] [4]

## Compatibilidade com a arquitetura existente

| Risco | Mitigação |
| --- | --- |
| Duplicar lead Instagram/WhatsApp | `channel_identities` separa identidade externa do lead; merge futuro poderá ocorrer por telefone/email confirmado. |
| Responder pelo WhatsApp em conversa Instagram | Dispatcher lê `conversation.channel` antes de `agent.connectionMode`. Default `whatsapp` preserva registros existentes. |
| Loop Ravi → Webhook → Ravi | Ignorar `is_echo`; índice único por MID; idempotência de evento e outbound. |
| Perder assinatura raw body | Rota Instagram registrada antes de `express.json()`, com parser raw próprio. |
| Dois processamentos do mesmo MID | Claim transacional/persistente no evento e unique index. |
| Ravi e humano simultâneos | `aiPaused/status=human_handoff` continua sendo a fonte única de automação. |
| Vazamento de credenciais | Secrets em ambiente, token cifrado, DTOs mascarados e logger com redaction. |
| Regressão WhatsApp/Ravi Web | Defaults `whatsapp`, branch Instagram isolado e suíte completa de regressão antes do checkpoint. |

## Validação da interface

A área **OPERAÇÃO > INSTAGRAM** foi validada no preview em `1440×900` e `390×844`. O desktop mantém status, métricas, filtros, inbox em três áreas e logs sem alterar a ordem dos demais módulos. No mobile, as mesmas áreas passam para fluxo vertical responsivo, sem largura excedente ou sobreposição. Estados vazios exibem apenas zeros e “—”, sem dados simulados.

Após a publicação do checkpoint `d8462ca1`, o login administrativo e o item **OPERAÇÃO > INSTAGRAM** foram confirmados no domínio de produção `agentedozap.com`, mantendo os demais menus e métricas existentes intactos.

O botão **CONECTAR INSTAGRAM** em produção gerou um state assinado e abriu com sucesso a tela oficial `instagram.com/oauth/authorize/third_party/`, vinculada ao App `2533423037090142`, com redirect para `https://agentedozap.com/api/instagram/oauth/callback`. A próxima etapa exige autenticação e consentimento manual do titular da conta profissional.

## Adaptação para Facebook Login for Business

Por decisão do proprietário, a autorização será realizada pelo **Facebook Login for Business**, pois o usuário administra o App e os ativos pela conta Facebook. A Meta exige uma Página vinculada ao Instagram profissional; o fluxo obtém um User Access Token curto, troca-o no backend por token de longa duração, consulta `/me/accounts` e resolve `instagram_business_account` para cada Página autorizada.[6] [8]

Para mensageria, serão solicitadas somente as permissões documentadas para este uso: `pages_show_list`, `pages_manage_metadata`, `pages_messaging`, `pages_read_engagement`, `business_management`, `instagram_basic` e `instagram_manage_messages`.[7] O host Graph muda de `graph.instagram.com` para `graph.facebook.com`. Quando houver uma única conta profissional, ela será selecionada automaticamente; com múltiplas contas, os candidatos e respectivos Page Access Tokens permanecerão cifrados no backend até a escolha administrativa. Nenhum ID ou token será solicitado manualmente ao usuário.

O envio deve usar `POST /v26.0/{PAGE_ID}/messages`, com Page Access Token, `messaging_type=RESPONSE` e o IGSID como destinatário. A inscrição do App na Página usa `/{PAGE_ID}/subscribed_apps`; os campos Instagram também permanecem configurados no App Dashboard.[9] [10]

### Bloqueio de domínio observado em produção

O OAuth publicado abriu `facebook.com/v26.0/dialog/oauth` com App ID, scopes, state e redirect corretos, mas a Meta exibiu “Não é possível carregar a URL — O domínio dessa URL não está incluído nos domínios do app”. Isso confirma um bloqueio de configuração do App, não do callback da aplicação. A correção segura é cadastrar `agentedozap.com` em **App Settings > Basic > App Domains**, habilitar a plataforma Website com `https://agentedozap.com/` e incluir exatamente `https://agentedozap.com/api/instagram/oauth/callback` em **Facebook Login > Settings > Valid OAuth Redirect URIs**. Client OAuth Login e Web OAuth Login precisam estar ativos; Strict Mode e HTTPS devem permanecer habilitados.[11] [12]

O redirect deve corresponder integralmente à allowlist, inclusive path e parâmetros fixos; o parâmetro `state` é ignorado na comparação. Não será usado wildcard, HTTP ou domínio alternativo.[11]

## Referências

[1]: https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login "Instagram API with Instagram Login — Meta for Developers"
[2]: https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login "Business Login for Instagram — Meta for Developers"
[3]: https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/messaging-api "Send Messages — Meta for Developers"
[4]: https://developers.facebook.com/documentation/instagram-platform/webhooks "Setup Webhooks Subscriptions — Meta for Developers"
[5]: https://developers.facebook.com/docs/graph-api/changelog/ "Graph API Changelog — Meta for Developers"
[6]: https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/get-started "Instagram API with Facebook Login — Getting Started"
[7]: https://developers.facebook.com/documentation/business-messaging/messenger-platform/overview "Messenger Platform Overview — Meta for Developers"
[8]: https://developers.facebook.com/documentation/facebook-login/guides/access-tokens/get-long-lived "Long-Lived Access Tokens — Meta for Developers"
[9]: https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages "Messenger Platform — Send a Message"
[10]: https://developers.facebook.com/docs/graph-api/reference/page/subscribed_apps/ "Page Subscribed Apps — Graph API Reference"
[11]: https://developers.facebook.com/documentation/facebook-login/security "Facebook Login Security — Meta for Developers"
[12]: https://developers.facebook.com/documentation/facebook-login/guides/advanced/manual-flow "Manually Build a Login Flow — Meta for Developers"

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

### Entrega efetiva de DMs pelo Webhook

Após a conexão de `@wedropbr`, cinco DMs reais foram enviadas, porém nenhuma notificação chegou ao endpoint: não houve registro em `instagram_webhook_events`, `messages` ou `channel_identities`. OAuth, Page Access Token, `subscribed_apps` e health check estavam válidos, portanto a ausência ocorreu antes da aplicação.

Para Facebook Login for Business, a Meta exige quatro passos independentes: verificar o callback HTTPS com Verify Token; selecionar o objeto **Instagram** no produto Webhooks; assinar os campos no App Dashboard; e habilitar a conta profissional via `/me/subscribed_apps` usando Page Access Token.[13] A configuração inicial deve priorizar `messages`, `messaging_postbacks`, `message_reactions`, `messaging_seen` e `messaging_referral`. O endpoint de Page subscriptions não substitui a assinatura dos campos Instagram no nível do App.[13] [14]

A documentação também exige que o App esteja **Ao vivo** para entregar Webhooks. Sem Advanced Access/App Review, eventos reais só são entregues quando a pessoa remetente possui uma função no App; para o teste inicial, a conta remetente deve ser adicionada como tester/desenvolvedor ou associada a um usuário com função. Mensagens de qualquer usuário externo exigirão Advanced Access, verificação empresarial e aprovação das permissões relevantes.[13] [15]

Para o envio, a regra é igualmente explícita: Apps com **Standard Access** só podem responder pessoas que possuam uma função no App. O teste imediato `@marcelomenezesfc → @wedropbr` deve usar o Facebook responsável por `@marcelomenezesfc` como administrador, desenvolvedor ou tester e com o convite aceito. A abertura para qualquer conta não é um toggle da aplicação: exige App Review/Advanced Access para `instagram_manage_messages` e permissões dependentes.[16] [17]

Como o WhatsAgent atende somente uma empresa própria (`@wedropbr`), a documentação classifica o cenário como negócio próprio com Facebook Login e Standard Access, sem App Review obrigatório; porém a limitação de destinatários/remetentes com função permanece no teste padrão. Para atendimento público irrestrito, a solicitação de Advanced Access deve incluir uso detalhado, credenciais de revisão e screencast de OAuth, inbound, resposta do Ravi, inbox e handoff.[17]

## Autópsia da DM “Teste real Ravi 1200”

A DM foi enviada de `@marcelomenezesfc` para `@wedropbr`, mas **nenhum POST chegou à aplicação**. Não existe row em `instagram_webhook_events`, `channel_identities` ou `messages` do canal Instagram; os logs não mostram falha de assinatura, rate limit, parsing, Ravi Core ou Send API. Portanto, o fluxo parou **antes do Webhook**, na elegibilidade da Meta para entregar esse evento específico.

A auditoria read-only da Graph API confirmou:

| Evidência | Resultado |
|---|---|
| Page Token | válido, tipo `PAGE`, `profile_id=103793205491621`, `app_id=2533423037090142` |
| Escopos | `pages_show_list`, `business_management`, `pages_messaging`, `instagram_basic`, `instagram_manage_messages`, `pages_read_engagement`, `pages_manage_metadata`, `public_profile` |
| Page subscription | ativa para `messages`, `messaging_postbacks`, `messaging_referrals` |
| App subscription | objeto `instagram`, callback correto, `active=true`, campos `messages`, `message_reactions`, `messaging_postbacks`, `messaging_seen`, `messaging_referral` ativos em v26.0 |
| App domains | `agentedozap.com`; URL pública `https://agentedozap.com/` |
| Funções aceitas | somente Facebook user `1071087682511700` como `administrators` |
| Evento/MID/IGSID da DM 1200 | inexistentes, pois a Meta não entregou o POST |
| Ravi Core/Send API | não executados; portanto não há erro Meta de envio |

Os únicos erros retornados pela Graph durante a sonda foram `(#100) Tried accessing nonexisting field (permissions)` ao consultar `/me/permissions` com Page Token e `(#100) Tried accessing nonexisting field (subscribed_apps)` no Instagram Account ID. Eles são diagnósticos de endpoint/tipo de token e **não causaram a DM ausente**: o `debug_token` contém todos os escopos e a subscription correta é comprovada no Page ID.

Assim, a hipótese restante e sustentada pelas evidências é **autorização de teste/Access Level**: o portfólio empresarial e a descoberta OAuth de `@marcelomenezesfc` não provam que esse perfil esteja aceito como tester do App. A correção mínima é adicionar e aceitar explicitamente a função de teste correspondente; a abertura para remetentes sem função exige Advanced Access/App Review.[15] [16]

A DM `Teste development Ravi 1220` foi enviada após alternar temporariamente o App para Development Mode. O resultado permaneceu idêntico: `instagram_webhook_events=0`, identidades Instagram `=0`, mensagens Instagram `=0` e nenhum log novo de Ravi/adapter. Portanto, Development Mode e a função Facebook de Administrador não autorizaram automaticamente o perfil profissional `@marcelomenezesfc`. O App foi restaurado a **Live Mode** (`switch=true`) imediatamente após o teste. A exigência restante é Advanced Access/App Review; não há correção de código a aplicar nessa etapa.

### Fluxo de tester para @marcelomenezesfc

A documentação oficial de App Roles confirma que o convite é enviado em **App Roles/Funções do app** e só se torna ativo depois que o convidado o aceita em **Facebook → Configurações e privacidade → Sua atividade → Aplicativos e sites → Solicitações**. Um tester comum não precisa ser Meta Developer, mas precisa aceitar os termos e confirmar que atua em nome do proprietário do App.[18]

Para o produto Instagram, a Meta também permite adicionar contas públicas de Instagram para testes em **App Roles → Roles** e informa que essas contas podem ser gerenciadas na mesma área.[19] No caso atual, a sequência mais segura é: (1) adicionar o Facebook titular como Authorized App Tester; (2) aceitar o convite no Facebook; (3) se a seção **Instagram Testers** estiver disponível, adicionar `marcelomenezesfc`; (4) aceitar o convite em Instagram → Configurações → Apps e sites → Convites de tester. A conta só deve ser considerada habilitada após aparecer como função ativa e uma DM gerar um MID real.

A inspeção autenticada do painel mostrou uma distinção importante. O App `2533423037090142` é gerenciado pelo portfólio `4354138904841069` (Rafaela Gomes de Jesus) e lista **Marcelo Menezes como Administrador**. No Meta Business Suite, o App também mostra Marcelo com acesso total. Portanto, adicionar novamente o mesmo Facebook como tester seria redundante e a Meta exige outra conta para um novo convite. Já `@marcelomenezesfc` aparece no portfólio empresarial `786659509548743`, vinculado ao ativo “Venda Sem Estoque”. Assim, os dois ativos **não estão no mesmo portfólio**; ser administrador do App não transformou automaticamente a identidade Instagram daquele outro portfólio em testadora autorizada.

O próximo passo mínimo não é alterar o código nem duplicar a função Facebook de Marcelo. É localizar a configuração específica de conta de teste do produto Instagram ou, caso o App com Facebook Login não exponha Instagram Testers, conceder Advanced Access. A prova continua sendo a geração de um MID real no Webhook.

### Access Level confirmado no App

A inspeção autenticada de **Análise do app → Permissões e recursos** confirmou que `instagram_manage_messages` está em **Standard access**, com zero chamadas e nenhuma análise aprovada. A documentação oficial de Webhooks atualizada em 3 de março de 2026 estabelece que Apps Business/Instagram Messaging via Messenger Platform precisam de **Advanced Access** e verificação empresarial para receber notificações Webhook reais. Também diferencia o teste de amostra do painel — que apenas comprova callback — de uma mensagem real enviada por uma conta pública adicionada ao teste.[20]

Isto explica a combinação observada: callback e campo `messages` estão ativos, o teste “Enviar para meu servidor” retorna sucesso, Page/App subscriptions e escopos estão corretos, mas DMs reais não geram POST, MID ou IGSID. O App não possui Advanced Access. Uma função Facebook duplicada não resolve; o único atalho de teste possível é adicionar explicitamente uma conta pública na configuração de teste do produto Instagram, se essa interface estiver disponível. Para qualquer remetente público, a correção necessária é concluir Business Verification e App Review de `instagram_manage_messages`.[20]

A tela autenticada confirmou `instagram_manage_messages` em **Standard access**, “Pronto para usar (0)” e sem análise aprovada. O App já possui uma solicitação de análise **não enviada** (`submission_id=2679013885864389`) contendo `instagram_manage_messages`, `instagram_business_manage_messages` e `Human Agent`. O formulário exige concluir Verificação, Configurações do app, Uso permitido, Tratamento de dados e Instruções da análise antes do envio. Nenhuma submissão foi realizada.

Para o fluxo final via Facebook Login/Messenger Platform, `instagram_manage_messages` é a permissão central. `instagram_business_manage_messages` pertence ao fluxo Instagram Login e `Human Agent` amplia a política de resposta; ambos devem ser removidos da solicitação salvo necessidade comercial documentada, reduzindo escopo e risco de rejeição. O envio do App Review é operação externa sensível e só será realizado após revisão do proprietário.

A inspeção completa de **Funções do app** confirmou que não há tester adicional nem convite pendente; Marcelo já é Administrador ativo. O formulário “Adicionar pessoas” não aceita duplicar Marcelo como tester e a configuração atual do produto não expõe uma seção separada de Instagram Testers. Portanto, o teste por função não oferece outro passo aplicável ao mesmo titular. O bloqueio restante é exclusivamente o nível **Standard access** de `instagram_manage_messages`.

### Pré-requisito da conta profissional: Connected Tools

A documentação oficial de Getting Started da Instagram Messaging API adiciona um pré-requisito independente de OAuth, subscriptions e Access Level: a conta profissional precisa habilitar **Instagram → Configurações → Mensagens e respostas ao story → Controles de mensagem → Ferramentas conectadas → Permitir acesso às mensagens**.[21] Se esse toggle estiver desligado, mensagens permanecem acessíveis apenas no Instagram e não são entregues a ferramentas de terceiros.[22]

Esse ajuste ainda não havia sido confirmado em `@wedropbr` e deve ser verificado antes de atribuir definitivamente a ausência de MID ao App Review. A DM 1220 provou ausência de evento, mas não distingue Standard Access de Connected Tools desligado. A ordem correta agora é validar/habilitar o toggle, repetir uma sentinela e só então retomar Advanced Access se ainda não houver POST.

O proprietário forneceu uma captura do Instagram `@wedropbr` comprovando **Ferramentas conectadas → Permitir acesso às mensagens = ativado**. A mesma tela confirma pedidos de contato permitidos para **Todos**. Portanto, Connected Tools e controles de solicitações não explicam a ausência dos Webhooks e essa hipótese foi descartada sem alteração.

Na etapa **Instruções para o analista**, a Meta solicita: URL pública, explicação de navegação/teste, indicação se Facebook Login está integrado, credenciais/códigos de acesso quando necessários, restrições geográficas e documentação de apoio. A submissão deve usar uma conta administrativa de revisão dedicada — nunca a senha pessoal do proprietário — e um vídeo mostrando login em `agentedozap.com`, `OPERAÇÃO > INSTAGRAM`, OAuth “Conectar via Facebook”, chegada de uma DM, resposta do Ravi e handoff humano.

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
[13]: https://developers.facebook.com/documentation/instagram-platform/webhooks "Setup Webhooks Subscriptions — Meta for Developers"
[14]: https://developers.facebook.com/docs/graph-api/reference/page/subscribed_apps/ "Page Subscribed Apps — Meta for Developers"
[15]: https://developers.facebook.com/documentation/business-messaging/instagram-messaging/webhooks "Webhooks for Instagram Messaging — Meta for Developers"
[16]: https://developers.facebook.com/documentation/business-messaging/instagram-messaging/features/send-message "Send a Message — Instagram Messaging — Meta for Developers"
[17]: https://developers.facebook.com/documentation/instagram-platform/app-review "App Review for Instagram API — Meta for Developers"
[18]: https://developers.facebook.com/documentation/development/build-and-test/app-roles "App Roles — Meta for Developers"
[19]: https://developers.facebook.com/documentation/instagram-platform/create-an-instagram-app "Customize the Manage messaging and content on Instagram Use Case — Meta for Developers"
[20]: https://developers.facebook.com/documentation/instagram-platform/webhooks "Setup Webhooks Subscriptions — Meta for Developers, atualizado em 3 mar. 2026"
[21]: https://developers.facebook.com/documentation/business-messaging/instagram-messaging/get-started "Instagram Messaging Getting Started — Enable message control connected tools settings"
[22]: https://www.facebook.com/help/instagram/791161338412168 "Manage access to Instagram messages across apps — Instagram Help Center"

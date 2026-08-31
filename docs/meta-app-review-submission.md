# Rascunho de App Review — Instagram Direct

> **Status:** preparado, não enviado. Não inserir credenciais pessoais neste arquivo nem no repositório.

Atualização operacional: a solicitação `2679013885864389` foi reduzida para **somente `instagram_manage_messages`**. `instagram_business_manage_messages` e `Human Agent` foram removidos com autorização do proprietário. As instruções de navegação e a ausência de restrição geográfica foram preenchidas no rascunho; Facebook Login foi marcado como integrado. A solicitação não foi enviada.

Estado atual no painel: **Verificação** e **Configurações do app** aparecem concluídas. **Uso permitido** e **Tratamento de dados** ainda precisam ser preenchidos. **Instruções da análise** foram parcialmente preenchidas, mas continuam “Precisa da sua análise” porque faltam credenciais dedicadas e documentação/screencast. O botão de envio permanece desabilitado e nenhuma solicitação foi submetida.

A etapa **Uso permitido** informou uma dependência obrigatória: a submissão de `instagram_manage_messages` também deve incluir `instagram_basic`. Ela exige uma descrição do uso, um screencast ponta a ponta e confirmação de conformidade. Portanto, o escopo mínimo correto é `instagram_basic` + `instagram_manage_messages`; as permissões `instagram_business_manage_messages` e `Human Agent` permanecem fora do pedido.

A tabela **Permissões e recursos** confirma que `instagram_basic` existe com Standard Access, status “Pronto para usar (0)” e ação **Solicitar acesso avançado**. Ela deve ser adicionada ao mesmo rascunho antes de concluir o questionário de uso permitido.

Foi executada uma chamada Graph API read-only bem-sucedida em `/{INSTAGRAM_ACCOUNT_ID}?fields=id,username,name,profile_picture_url,followers_count` usando o Page Token cifrado. A Meta respondeu HTTP 200 para `@wedropbr`, comprovando uso real de `instagram_basic` e atendendo ao pré-requisito de pelo menos uma chamada bem-sucedida nas últimas 24 horas. A chamada não alterou conteúdo nem expôs o token.

Imediatamente após a chamada, o painel ainda exibia “Pronto para usar (0)” e manteve **Solicitar acesso avançado** desabilitado (`aria-disabled=true`). Isso indica atraso de contabilização da telemetria Meta, não falha da chamada. O rascunho não pode incluir `instagram_basic` até o painel atualizar.

O App está atualmente em **Live Mode**. Para obter a evidência de ponta a ponta usando Standard Access e uma pessoa com App Role, o teste deve ser repetido temporariamente em **Development Mode**; nesse modo, somente administradores/desenvolvedores/testers podem interagir. Após gerar o MID, validar Ravi/Send API e gravar o screencast, o App pode voltar a Live antes do envio do App Review. A troca de modo não altera o código nem o banco, mas deve ser confirmada pelo proprietário.

Com autorização explícita do proprietário, o App foi alternado temporariamente para **Development Mode**. O toggle do App Dashboard confirmou `false` para Live. Nenhuma permissão foi submetida e os canais WhatsApp/Z-API/Ravi Web não foram alterados. O próximo passo é uma única DM sentinela do administrador para validar se Standard Access entrega o evento nesse modo.

Resultado: a DM `Teste development Ravi 1220` não gerou POST, MID, IGSID ou qualquer persistência, mesmo em Development Mode. O App foi restaurado ao modo **Ao vivo** e o toggle confirmou `true`. Isso comprova que a função Facebook de Administrador não habilita automaticamente a identidade Instagram de outro portfólio; a evidência real dependerá da aprovação de Advanced Access.

## Escopo recomendado

Solicitar Advanced Access somente para `instagram_basic` e `instagram_manage_messages`, além das permissões Facebook/Page que a Meta vincular automaticamente. `instagram_basic` é uma dependência explicitamente exigida pelo formulário. Manter fora `instagram_business_manage_messages`, porque o fluxo final usa Facebook Login/Messenger Platform, e `Human Agent`, salvo justificativa real para respostas humanas fora da janela padrão.

## URL e navegação para o analista

URL pública: `https://agentedozap.com/`

Roteiro sugerido:

1. Acesse `https://agentedozap.com/login` e entre com a conta de revisão dedicada fornecida no formulário da Meta.
2. No menu lateral, abra **OPERAÇÃO > INSTAGRAM**.
3. Verifique o status da conta profissional conectada `@wedropbr`, o health check e o callback configurado.
4. Envie uma DM de uma conta de teste para `@wedropbr`.
5. Aguarde a mensagem aparecer no inbox Instagram e a resposta do Ravi ser enviada no Direct.
6. Abra a conversa, clique **ASSUMIR CONVERSA**, envie uma resposta humana e confirme que a IA não responde em paralelo.
7. Clique **DEVOLVER PARA O RAVI** e envie outra DM para confirmar a retomada.

## Explicação de uso da permissão

`instagram_manage_messages` é usada exclusivamente para receber mensagens iniciadas pelo usuário na conta profissional `@wedropbr` e responder dentro da janela permitida pela Meta. O WhatsAgent normaliza o evento, deduplica por MID, associa o IGSID a um lead/conversa, executa o Ravi Core e envia a resposta pelo endpoint oficial `/{PAGE_ID}/messages`. Operadores autorizados podem assumir a conversa, suspendendo a IA até a devolução explícita.

## Facebook Login

O Facebook Login for Business é usado como OAuth para o administrador conectar a Página e a conta profissional do Instagram. Ele não substitui o login interno do painel. No formulário, explicar essa distinção: o analista entra primeiro no painel com a conta de revisão e, se necessário, reconecta o ativo usando o Facebook fornecido para revisão.

## Tratamento de dados

O sistema armazena somente dados necessários ao atendimento: IGSID, username/nome quando disponíveis, mensagens, anexos, timestamps, origem/referral e estado comercial. Access Tokens ficam cifrados AES-256-GCM no backend. App Secret e Verify Token ficam em secrets de ambiente. Webhooks validam `X-Hub-Signature-256`, eventos são deduplicados, tokens nunca são retornados ao frontend e logs são sanitizados.

## Evidência em vídeo

Gravar um screencast contínuo, sem cortes, contendo:

1. URL do navegador e login no painel com conta dedicada.
2. Página **OPERAÇÃO > INSTAGRAM** conectada a `@wedropbr`.
3. DM real enviada por conta autorizada.
4. Evento recebido no inbox e resposta do Ravi visível no Instagram.
5. Fluxo **ASSUMIR CONVERSA → resposta humana → DEVOLVER PARA O RAVI**.
6. Tela de status/health check sem exibir tokens ou secrets.

## Pendências antes do envio

- Criar conta administrativa dedicada ao revisor e armazenar a senha somente no formulário seguro da Meta.
- Concluir verificação empresarial do portfólio responsável pelo App.
- Confirmar URLs públicas de Política de Privacidade e Exclusão de Dados.
- Produzir o screencast após o primeiro MID real.
- Revisar e confirmar a remoção de permissões não usadas antes de qualquer submissão.

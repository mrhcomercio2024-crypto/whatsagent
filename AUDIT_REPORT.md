# Auditoria do fluxo do agente — WhatsAgent

**Data:** 25 de abril de 2026
**Versão auditada:** v21 (`84a29b67`)
**Suite de testes:** 150 / 150 verde, 20 arquivos
**Pipeline coberto:** ingestão (webhook Cloud API e Baileys) → coalescência (`debounceWorker`) → orquestrador (`processInboundForReply`) → blindagens (resumo, etapas, termos proibidos, anti‑skip, anti‑repetição) → dispatcher (Cloud API ou Baileys) → realtime (SSE).

A revisão a seguir descreve o que está sólido, o que está frágil e o que pode ser melhorado. As recomendações estão organizadas por prioridade para que se possa decidir o que entra na próxima fase de evolução.

## 1. Diagnóstico rápido

A arquitetura está coerente: o ingresso grava sempre **antes** de agendar (logo, o histórico que chega na LLM contém a última fala do lead), o debounce é **fixed window** tanto no servidor quanto no front do Simulador, o orquestrador centraliza decisões e tem múltiplas camadas de blindagem, e o dispatcher respeita simulação de digitação e split de mensagens longas. Ainda assim, há quatro pontos sensíveis que justificam atenção, descritos nas seções 2 a 5.

## 2. Fragilidades de **alta** prioridade

### 2.1 Coalescência fixa de 5 minutos no `debounceWorker`

Em `server/ai/debounceWorker.ts:61`, todas as mensagens **inbound** dos últimos 5 minutos são concatenadas em um único turno antes de ir para a LLM, independentemente do `debounceMs` configurado por agente. Em conversas reais com debounce baixo (5–10 s) isso é inofensivo, mas em conversas paradas que recebem uma nova rajada a janela pode varrer mensagens antigas e injetá‑las de novo no contexto, fazendo o agente “responder coisas velhas”. Recomenda‑se trocar a constante por `Math.max(agent.debounceMs ?? 0, 60_000)` ou — melhor — coalescer apenas o que chegou **depois** do último outbound.

### 2.2 Comentário desatualizado no webhook produtivo

`server/whatsapp/webhook.ts:208–212` ainda explica que “cada nova mensagem do lead empurra o pendingProcessAt para frente”. O comportamento real, depois da Fase 45, é fixed window — `setConversationPendingProcessAt` preserva a janela existente. O comentário não muda comportamento, mas confunde quem revisa o código e pode levar a regressões. Sugiro atualizar o texto e adicionar um teste de integração rápido garantindo que duas mensagens consecutivas do mesmo lead **não** adiam o disparo.

### 2.3 Autorização do SSE não verifica posse da conversa

`server/realtime/sse.ts` confere autenticação e existência da conversa, mas não valida se a conversa pertence ao agente do usuário. Em produção multi‑tenant isso permite que qualquer usuário logado consuma o stream de qualquer conversa cujo id seja conhecido. Em `getConversationById`, basta cruzar com `agents.ownerId` (ou `userId`) e responder 403 se não bater.

### 2.4 Sumarização pode rodar com histórico incompleto

`shouldRefreshSummary` é puramente baseado em contagem total de mensagens (a cada 6 por padrão). Quando o lead manda uma rajada coalescida, o orquestrador trata a rajada como **uma** mensagem adicional, mas o resumidor lê as últimas 30 mensagens do banco. Em conversas com longas pausas, o resumo pode acabar refletindo o contexto antes da rajada e desalinhar o prompt. Para reduzir o risco, alimentar o resumidor com a mesma `inboundText` coalescida (extra context) ou disparar o refresh sempre que `currentStepId` muda.

## 3. Fragilidades de **média** prioridade

### 3.1 Sinalização do `currentStepStartedAt`

O auto‑avanço por `maxMessages` (Fase 42) hoje usa `conv.updatedAt` como fallback para datar o início da etapa. Em conversas com intervenção humana frequente, esse `updatedAt` é atualizado por outras razões (status, pause, sentMediaIds), e a contagem pode subestimar mensagens da etapa. Persistir `currentStepStartedAt` em `conversations` torna a contagem 100% precisa e barata.

### 3.2 Anti‑repetição apenas exata

A camada de anti‑repetição compara texto normalizado **idêntico**. Variações como “Faz sentido pra você?” ↔ “Isso faz sentido?” não são pegas. Um Jaccard com limiar 0,75 sobre tokens (já há `norm` no orquestrador) seria simples de adicionar e cobriria os casos vistos em conversas reais.

### 3.3 Validador de termos proibidos não cobre mídia

Quando o agente despacha uma `media` por gatilho, o caption da mídia (`media.caption`) é enviado sem passar pelo `findRestrictedHits`. Se a empresa quiser proibir uma palavra que está em uma mídia legada cadastrada antes do termo, ela vaza. Vale rodar o validador também nos captions e, opcionalmente, mascarar antes do envio.

### 3.4 Falta de retry para LLM

`invokeWithModel` propaga falhas para o orquestrador, que cai no fallback “Desculpe, tive uma falha técnica…”. Em produção, falhas transitórias (timeout, 503) costumam ser retry‑friendly. Recomenda‑se um único retry com backoff curto antes do fallback humano e métrica `llm_failure` distinta, hoje agrupada em `response_time_ms`.

## 4. Fragilidades de **baixa** prioridade

### 4.1 Observabilidade limitada por turno

Logs do orquestrador são bons (etapa, ações, motivo de skip/leak), mas não há um “debug por turno” na UI da aba Chat. Para QA em produção, seria útil expor — só para o operador — uma pílula com etapa ativa, motivo de regen e contagens da etapa.

### 4.2 Seleção de RAG simplificada

`selectKnowledge` em `prompt.ts` ainda é um cosseno por TF aproximado sobre as últimas 6 mensagens. Para bases grandes (mais de ~50 entradas), embeddings reais (`text-embedding-3-small`) melhorariam muito a qualidade sem mudança grande.

### 4.3 Limites de contexto

`buildMessages` corta `history.slice(-30)` sem checar tamanho em tokens. Conversas com mensagens muito longas (transcrições de áudio, descrições de imagem) podem estourar o limite do modelo. Adicionar um `enforceTokenBudget` (heurístico: 4 chars/token) antes de mandar é seguro.

### 4.4 Sem teste E2E real

Toda a suite são testes de unidade ou de função pura. Um teste de integração leve com `getDb` em modo `:memory:` cobrindo o caminho “ingressou → debounceWorker → orchestrator → dispatcher” daria confiança real ao deploy. Hoje os snapshots cobrem o parsing do Baileys mas não a orquestração completa.

## 5. Pontos fortes a preservar

A camada de **blindagem do agente** (Fases 41–48) é o maior diferencial: anti‑leak, anti‑skip, anti‑repetição, validador de termos proibidos e modo literal compõem um sistema raro em chatbots comerciais. O **comando interno `/limpar`** é o melhor recurso de QA — funcional do simulador, do operador humano e do orquestrador. A **memória de resumo evolutivo** com modelo configurável por agente reduz custo e mantém continuidade. Mantenha o `RESET_REPLY` curto e o bloco **ÚLTIMA MENSAGEM DO LEAD** no fim do prompt — esses dois detalhes são responsáveis pela maior parte das melhorias recentes.

## 6. Recomendações priorizadas

| # | Item | Impacto | Esforço |
| --- | --- | --- | --- |
| 1 | Trocar coalescência fixa por janela ligada ao `debounceMs` ou ao último outbound | Alto | Baixo |
| 2 | Validar posse da conversa no SSE | Alto | Baixo |
| 3 | Atualizar comentário do webhook + teste de integração da fixed window | Médio | Baixo |
| 4 | Persistir `currentStepStartedAt` em `conversations` | Médio | Médio |
| 5 | Anti‑repetição por similaridade (Jaccard ≥ 0,75) | Médio | Baixo |
| 6 | Validador de termos proibidos rodando em captions de mídia | Médio | Baixo |
| 7 | Retry com backoff curto em `invokeWithModel` | Médio | Baixo |
| 8 | Pílula de debug por turno na aba Chat | Baixo | Médio |
| 9 | Embeddings reais em `selectKnowledge` | Baixo | Médio |
| 10 | Teste de integração ingresso → orquestrador → dispatcher | Baixo | Médio |

Os itens 1, 2, 3 e 5 podem entrar no próximo checkpoint sem mexer em schema; 4 exige migration. Os demais são incrementos de qualidade que podem ser intercalados conforme prioridade de produto.

## 7. Conclusão

O fluxo atual é estável, com 150 testes verdes e múltiplas camadas de proteção contra os sintomas observados nas conversas reais (vazamento de etapa, repetição, ignorar última fala do lead). As ações recomendadas na seção 6, especialmente as três primeiras, eliminam riscos concretos sem reescrever o pipeline. Para a próxima iteração sugiro atacá‑las em conjunto e fechar o ciclo com um teste de integração que reproduza um diálogo de 5–6 turnos cobrindo concordância curta, mídia recebida e auto‑avanço por limite de mensagens — isso traria confiança equivalente a uma execução manual no Simulador.

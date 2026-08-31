# Fase 104 — Causa de `Resposta não encontrada`

## Origem exata

| Camada | Local | Condição |
|---|---|---|
| Backend | `server/publicSimulator/router.ts`, endpoint tRPC `publicSimulator.requestStatus` | `getPublicRequestForSession(session.id, requestId)` não encontra uma linha e retorna `status: "missing"`. |
| Frontend | `client/src/pages/PublicSimulatorChat.tsx`, função `recoverRequest` | O primeiro `state.status === "missing"` limpa o request do `localStorage` e executa `throw new Error("Resposta não encontrada")`. |

## Request real correlacionado

A ocorrência mais recente está associada à sessão pública **19**, `publicId=1f06cdba84734a1cbf883aa63b378d00`, `conversationId=150019` e `leadId=150019`. O request anterior, `9e404d9d-d80f-43d0-9c72-6a0d9d7c7f9f`, foi persistido como `completed` e gerou normalmente a inbound “Sim, quero saber como funciona.” e duas outbounds do Ravi.

Depois disso, a sessão permaneceu online (`lastSeenAt=04:47:20`), mas não apareceu um novo request nem uma nova inbound no banco. Portanto, o request que produziu o erro existiu apenas no navegador e não chegou ao `beginPublicRequest`. A versão anterior do painel não exibia o requestId ativo, então o UUID exato que ficou somente no iPhone não é recuperável retroativamente.

## Classificação A–J

O cenário confirmado é uma combinação de **A + E + J**: o backend nunca recebeu/criou o novo request; o recovery consultou imediatamente um UUID ainda ausente; e o frontend tratou essa ausência transitória como erro definitivo, sem backoff e sem reenviar idempotentemente a operação original. Não há evidência de B, C, D, F, G, H ou I: a sessão/conversa não mudou, não existe row com requestId alternativo, não houve inbound/outbound órfã e não apareceu concorrência no banco.

## Correção adotada

O endpoint passa a retornar apenas `processing`, `completed`, `failed` ou `expired`. Uma ausência recente é `processing` com `registered=false`; o frontend usa backoff 2s/3s/5s/8s e reenvia a operação original uma vez com o mesmo requestId. A restrição única `sessionId + requestId` e a criação do request antes da inbound/modelo garantem idempotência.

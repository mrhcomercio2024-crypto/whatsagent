# Ravi Web Lite — escopo operacional

## Garantia de preservação

O checkpoint **`f73fa669`** registra a versão avançada antes das alterações funcionais do Lite. O modo Lite não exclui tabelas, registros, sessões, conversas, mensagens, subscriptions, regras, jobs, eventos, métricas ou código. A migration `0031_lowly_mikhail_rasputin.sql` é estritamente aditiva: inclui apenas `public_simulator_configs.webMode` com os valores `lite` e `advanced`.

## Comportamento por modo

| Camada | Lite | Advanced |
| --- | --- | --- |
| Cérebro, prompts, etapas, objeções e LLM | Ativo | Ativo |
| Lead, sessão, conversa, UTMs e histórico | Ativo | Ativo |
| Checkout, webhook de compra e analytics | Ativo | Ativo |
| Áudio e mídias do atendimento | Ativo | Ativo |
| PWA, Service Worker e PushManager | Pausado e limpo no navegador | Ativo |
| Consentimento e Web Push | Pausado | Ativo |
| Recovery automático por polling | Pausado | Ativo |
| Follow-up de recuperação por Push | Pausado | Ativo |

No Lite, o navegador faz um único envio síncrono protegido por `requestId`. Em sucesso, exibe a resposta persistida. Em erro ou timeout de 45 segundos, remove o estado de digitação e oferece **TENTAR NOVAMENTE** com o mesmo `requestId`; não cria sessão ou conversa nova e não executa polling de recovery.

## Service Worker e caches

Na primeira abertura em Lite, o frontend remove o link do manifest, desregistra o Service Worker `/sw.js`, apaga somente caches cujos nomes pertençam ao Ravi/PWA e recarrega a página uma única vez se ela ainda estiver sob controle do worker antigo. Credenciais anônimas, localStorage da sessão, conversa e histórico não são apagados. O parâmetro `?noSW=1` força a mesma limpeza para diagnóstico.

## Heartbeat pausado

Somente a tarefa abaixo foi pausada. Ela continua cadastrada e pode ser retomada futuramente.

| Nome | Task UID | Endpoint | Estado Lite |
| --- | --- | --- | --- |
| `ravi-web-push-recovery` | `jPPaMDLPc5hXZnXLSKpH8B` | `/api/scheduled/public-push-followups` | Pausado |

Nenhum job de WhatsApp/Z-API ou outra funcionalidade da plataforma foi alterado.

## Retorno ao modo Advanced

No painel **SIMULADOR WHATSAPP → Configuração**, altere **Modo público do Ravi Web** de **Lite** para **Advanced** e salve. Depois, retome o Heartbeat `jPPaMDLPc5hXZnXLSKpH8B`. Como contratos, dados e módulos avançados permanecem no projeto, não é necessário restaurar banco nem reaplicar migrations.

## Arquivos funcionais alterados

| Arquivo | Alteração Lite |
| --- | --- |
| `drizzle/schema.ts` | Flag aditiva `webMode` |
| `shared/raviWebMode.ts` | Normalização central da flag |
| `server/publicSimulator/router.ts` | Exposição do modo e bloqueio de Push no Lite |
| `server/publicSimulator/service.ts` | Pausa dos efeitos de recovery/Push no Lite |
| `client/src/pages/PublicSimulatorChat.tsx` | Envio simples, timeout, retry e gating avançado |
| `client/src/lib/webPush.ts` | Limpeza seletiva de PWA/SW/cache |
| `client/src/components/ViewportDebugPanel.tsx` | Debug mínimo `?debug=1` no Lite |
| `client/src/pages/PublicSimulatorAdmin.tsx` | Seletor reversível Lite/Advanced |

Nenhum arquivo de CSS ou regra de viewport foi modificado nesta fase.

# Fase 103 — validação intermediária no preview

Data: 31 de agosto de 2026.

O fluxo foi aberto com `?debugViewport=1`. Antes da conversa, a telemetria registrou `innerHeight=1100`, `documentClientHeight=1100`, `scrollY=0`, página `0..1100`, mensagens `60..1040`, compositor `1040..1100` e textarea de 32px.

Após acionar **SIM, QUERO SABER**, o request concluiu e dois balões foram revelados. O estado voltou para `online`, sem travamento em `digitando`, sem tela branca e sem alteração da geometria: `scrollY=0`, mensagens `60..1040` e compositor `1040..1100`.

O terceiro balão também foi revelado e o estado permaneceu `online`. A primeira simulação programática de 1/2/4 linhas não acionou o setter nativo do React e, por isso, manteve o textarea em 32px; esse resultado não foi considerado validação do crescimento. A validação seguinte deve usar foco e digitação reais no campo.

O navegador de automação não conseguiu transferir foco ao textarea nem pelo índice nem por coordenadas (`activeElement` permaneceu `body`). Para validar corretamente o componente controlado, o próximo passo usa o setter nativo de `HTMLTextAreaElement.prototype.value`, evento `input` e foco programático, que percorrem o mesmo handler React sem depender do overlay do preview.

Com o setter nativo e foco real, o textarea respondeu corretamente: uma linha = 32px/compositor 60px; duas linhas = 56px/compositor 84px; quatro linhas = 104px/compositor 132px. Em todos os casos, `activeElement=textarea`, `scrollY=0`, o compositor terminou exatamente em `innerHeight=1100` e a faixa de mensagens terminou exatamente no topo do compositor, sem lacuna ou sobreposição.

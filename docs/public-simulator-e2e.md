# Validação E2E — SIMULADOR WHATSAPP

Data: 31/08/2026 (ambiente de preview)

## Fluxo validado

1. A rota pública `/simulador/ravi?utm_source=teste&utm_campaign=fluxo_e2e` abriu sem autenticação e criou uma sessão anônima.
2. A primeira mensagem do RAVI apareceu com o botão único **SIM, QUERO SABER**.
3. O clique registrou a fala configurada do lead e chamou o cérebro real pelo orquestrador em `isSimulation: true`, sem acionar Z-API.
4. A resposta retornou em dois balões, respeitando atraso de digitação e intervalo entre mensagens.
5. O segundo turno exibiu contagem regressiva de 28 segundos, coerente com o `debounceSeconds` do agente ativo.
6. O texto informado pelo visitante continha nome, WhatsApp e e-mail; os três campos foram extraídos e persistidos corretamente.
7. `utm_source=teste` e `utm_campaign=fluxo_e2e` foram persistidos na sessão.
8. Recarregar a mesma URL no mesmo navegador retomou a sessão e exibiu todo o histórico exatamente do ponto salvo.
9. A aba privada **SIMULADOR WHATSAPP** apareceu no menu após login administrativo e carregou configuração, URL pública, webhook, prévia, etapas, mídias e conversas.
10. O painel de conversas exibiu as duas sessões criadas, KPIs, origem, campanha, etapa atual, duração e status.
11. O detalhe da conversa exibiu nome, telefone, e-mail, origem e todos os balões na ordem correta.

## Persistência confirmada

Sessão testada: `191321d35e7d4a50825212534a70e06e`, conversa `150002`, status `active`, nome `Marcelo`, telefone `+5511998765432`, e-mail `marcelo.teste@example.com`, origem `teste`, campanha `fluxo_e2e`.

## Visual

A página foi verificada em 1440×900 e 390×844. O layout manteve a lista lateral no desktop e concentrou apenas a conversa no mobile. Cabeçalho, CTA inicial, bolhas, horários, ticks, campo de texto, microfone, estado digitando e contagem regressiva ficaram legíveis nos dois tamanhos.

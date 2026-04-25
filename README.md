# WhatsAgent

Plataforma **self-hosted** de Agente de IA para atendimento via WhatsApp — com **dois modos de conexão por agente**: **API Cloud Oficial (Meta)** ou **QR Code (não oficial, via Baileys)**.

A ferramenta foi desenhada para parecer o mais humanizada possível, **amarrando** o agente a seguir estritamente o cérebro configurado, as etapas obrigatórias do script, a base de conhecimento e os gatilhos de mídia que você definir — tudo gerenciável pela interface, sem editar uma linha de código.

## Recursos principais

- **Cérebro do agente** — prompt mestre com persona, tom, regras, produtos, objeções e informações da empresa.
- **Etapas obrigatórias** do script (saudação, qualificação, apresentação, fechamento). Para cada etapa você escolhe um **LLM dedicado**, dentre todos os modelos disponíveis na ferramenta.
- **Base de conhecimento (RAG)** consultada antes de cada resposta para evitar alucinação.
- **Biblioteca de mídias** (imagens e vídeos) com gatilhos por **palavra-chave do lead**, por **etapa** ou por **decisão da IA**.
- **WhatsApp Cloud API oficial**: webhook + envio de texto, imagem, vídeo e templates HSM.
- **WhatsApp via QR Code** (modo alternativo): conecte um número escaneando o QR pelo celular, sem precisar aprovar BM/templates na Meta. ⚠️ Viola os Termos da Meta e o número pode ser banido — use por sua conta e risco.
- **Follow-up totalmente configurável**: intervalos, tentativas, mensagem fixa ou gerada pela IA, e política da janela 24h (livre, sempre template ou auto).
- **Inbox em tempo real** com possibilidade de pausar a IA e assumir o atendimento manualmente (handoff humano).
- **Qualificação automática de leads** (quente / morno / frio) e exportação CSV.
- **Simulador interno** para testar o cérebro sem enviar mensagens reais.
- **Dashboard de métricas**: atendimentos, tempo médio de resposta, conversões, follow-ups, distribuição por temperatura.
- **Operação**: horário de atendimento, mensagem fora do horário, palavras-chave para handoff humano, multi-agente.

## Stack

`Node.js 22` · `React 19` · `Tailwind 4` · `tRPC 11` · `Drizzle ORM` · `MySQL/TiDB` · `shadcn/ui` · `Vitest`.

## Como rodar

Veja o guia detalhado em [`SELF_HOSTING.md`](./SELF_HOSTING.md). Resumo:

```bash
pnpm install
# Crie um .env com as variáveis listadas em ENV_VARIABLES.md
pnpm drizzle-kit migrate
pnpm dev               # ou pnpm build && pnpm start
```

Conecte o WhatsApp em **Painel → WhatsApp** seguindo o passo a passo do guia.

## Testes

```bash
pnpm test
```

Os testes cobrem detecção de gatilhos de mídia, lógica de janela 24h e horário de atendimento.

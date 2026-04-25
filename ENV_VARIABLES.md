# Variáveis de ambiente do WhatsAgent

Quando for hospedar o projeto no seu próprio servidor, crie um arquivo `.env` (ou variáveis no orquestrador, Docker, systemd, etc.) com as chaves abaixo.

## Obrigatórias

| Chave | Exemplo | Descrição |
|---|---|---|
| `DATABASE_URL` | `mysql://user:pass@localhost:3306/whatsagent` | String de conexão MySQL/TiDB. |
| `JWT_SECRET` | `troque-por-um-segredo-longo-e-aleatorio` | Segredo para assinar cookies de sessão. |
| `BUILT_IN_FORGE_API_URL` | `https://api.openai.com/v1` | URL base do provedor LLM (compatível OpenAI). |
| `BUILT_IN_FORGE_API_KEY` | `sk-...` | Bearer token do provedor LLM. |

## Opcionais (Manus OAuth — substitua pela sua autenticação)

| Chave | Descrição |
|---|---|
| `VITE_APP_ID` | App ID do OAuth Manus (deixe em branco se for usar autenticação própria). |
| `OAUTH_SERVER_URL` | URL do backend OAuth. |
| `VITE_OAUTH_PORTAL_URL` | URL do portal de login. |
| `OWNER_OPEN_ID`, `OWNER_NAME` | Identificam quem assume o papel `admin` no primeiro login. |

## Opcionais (Frontend)

| Chave | Descrição |
|---|---|
| `VITE_APP_TITLE` | Nome exibido no navegador. |
| `VITE_APP_LOGO` | URL do logo. |
| `VITE_FRONTEND_FORGE_API_URL` | URL pública do provedor LLM se quiser chamadas diretas do front (não usadas hoje). |
| `VITE_FRONTEND_FORGE_API_KEY` | Token público equivalente. |
| `VITE_ANALYTICS_ENDPOINT`, `VITE_ANALYTICS_WEBSITE_ID` | Telemetria opcional. |

## Credenciais do WhatsApp Cloud API

**Não vão para o `.env`** — são salvas dentro do banco, por agente, na tela `WhatsApp` do painel:

- `phoneNumberId`
- `businessAccountId`
- `accessToken`
- `verifyToken` (você inventa e usa também na Meta)
- `appSecret` (validação de assinatura do webhook)

Esse design permite operar múltiplos agentes/números na mesma instância.

# Integração Looma/Pagar.me — decisões verificadas

A Looma divulga publicamente que o checkout opera sobre infraestrutura Stone. A central do Pagar.me também lista a Looma entre as plataformas parceiras. Como não há documentação pública específica da Looma descrevendo o payload de webhook entregue ao produtor, o simulador terá um receptor flexível que aceita o envelope Pagar.me V5 e pode ser ajustado posteriormente ao payload real da conta Looma.

O Pagar.me envia webhooks por HTTP POST e permite escolher os eventos. Os eventos relevantes para conversão são `order.paid`, `invoice.paid` e `charge.paid`; falhas e estornos podem aparecer como `order.payment_failed`, `invoice.payment_failed`, `charge.payment_failed` e `charge.refunded`.

O endpoint usará duas camadas de segurança compatíveis com a configuração disponível: segredo aleatório na URL e, quando fornecida pela origem, validação HMAC SHA-256 pelo header `X-Signature`. O `eventId` será único no banco para garantir idempotência. A compra será associada à sessão pelo `publicId`, telefone ou e-mail encontrado no payload, nesta ordem.

## Fontes

1. https://looma.app.br/ — Looma, checkout e infraestrutura Stone.
2. https://pagarme.helpjuice.com/p2-modulos-e-plataformas — Looma listada como integração/parceira.
3. https://docs.pagar.me/reference/vis%C3%A3o-geral-sobre-webhooks — envelope e funcionamento dos webhooks.
4. https://docs.pagar.me/reference/eventos-de-webhook-1 — catálogo de eventos, incluindo pedidos, faturas e cobranças pagas.

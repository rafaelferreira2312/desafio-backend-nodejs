# Atendimento WhatsApp com IA

Backend em Node.js + TypeScript para receber webhooks assinados da Meta WhatsApp Cloud API, persistir conversas, processar mensagens de forma assíncrona e responder via OpenAI ou fallback controlado pela base de conhecimento.

## Stack

- Node.js 20+
- TypeScript
- Fastify
- PostgreSQL
- Drizzle ORM
- Redis + BullMQ
- OpenAI
- Pino
- Zod
- Vitest

## Como Rodar

Copie as variáveis de ambiente:

```bash
cp .env.example .env
```

Suba a infraestrutura:

```bash
docker compose up -d
```

Se a porta `6379` já estiver ocupada por um Redis local, o container Redis pode falhar, mas a aplicação continuará funcionando se `REDIS_URL=redis://localhost:6379` apontar para esse Redis.

Instale as dependências:

```bash
npm install
```

Execute as migrations:

```bash
npm run db:migrate
```

Suba o servidor HTTP:

```bash
npm run dev
```

Em outro terminal, suba o worker:

```bash
npm run worker
```

Teste o mock da Meta:

```bash
curl http://localhost:8001/health
```

Simule uma mensagem inbound:

```bash
curl -X POST http://localhost:8001/simulate/inbound \
  -H "Content-Type: application/json" \
  -d '{ "from": "5511999990000", "text": "Quais são os planos de vocês?" }'
```

Confira a resposta enviada:

```bash
curl http://localhost:8001/sent
```

## Scripts

```bash
npm run dev         # servidor HTTP na porta 8000
npm run worker      # worker BullMQ
npm run db:generate # gera migrations Drizzle
npm run db:migrate  # aplica migrations
npm run typecheck   # valida TypeScript
npm test            # executa testes
```

## Arquitetura

O webhook HTTP fica em `src/index.ts`. Ele valida o handshake da Meta em `GET /webhook`, valida a assinatura HMAC-SHA256 no corpo cru em `POST /webhook`, persiste a mensagem e enfileira um job BullMQ. A rota responde rápido e não chama OpenAI diretamente.

O worker fica em `src/worker.ts`. Ele consome a fila, carrega histórico da conversa e a `knowledge-base/`, gera a resposta com OpenAI quando há chave configurada, salva a mensagem outbound e envia para a Meta API/mock.

A persistência fica em `src/db/schema.ts` e `src/services/conversation-service.ts`. O schema possui `tenants`, `contacts`, `conversations` e `messages`.

## Idempotência

A idempotência é garantida no banco com a restrição única:

```text
tenant_id + wa_message_id
```

Quando a Meta reentrega o mesmo `message.id`, a aplicação não cria outra mensagem nem enfileira outro processamento.

## Multi-Tenant

Todas as entidades principais possuem `tenant_id`. O tenant é derivado do `metadata.phone_number_id` recebido no webhook. Nas rotas REST, o tenant pode ser informado por `x-tenant-id` ou resolvido por `x-phone-number-id`.

Rotas disponíveis:

```bash
GET /conversations
GET /conversations/:id/messages
```

## LLM e Base de Conhecimento

O worker monta o contexto com:

- Histórico recente da conversa.
- Arquivos Markdown de `knowledge-base/`.

Se `OPENAI_API_KEY` estiver configurada com uma chave real, a resposta é gerada pela OpenAI com temperatura baixa e instrução explícita para usar apenas a base.

Se a chave estiver ausente ou igual ao placeholder do `.env.example`, a aplicação usa um fallback determinístico para os temas cobertos pela base: planos, boleto, instalação, suporte, cobertura e cancelamento. Para temas fora da base, responde que não encontrou a informação.

## Resiliência e Observabilidade

Os jobs BullMQ usam retry com backoff exponencial:

```text
attempts: 3
backoff: exponential, 5s
```

Os logs são estruturados com Pino e incluem dados como `tenantId`, `conversationId`, `messageId` e `jobId` para facilitar rastreio de atendimento.

## Testes

Execute:

```bash
npm test
```

Coberturas principais:

- Assinatura HMAC-SHA256 válida, inválida e ausente.
- Extração de mensagens do payload da Meta.
- Fallback da assistente sem OpenAI.
- Resposta segura para assunto fora da base.
- Restrições de schema para idempotência e isolamento por tenant.

Também foi validado:

```bash
npm run typecheck
```

## Teste Manual Realizado

Fluxo validado localmente com mock:

```bash
curl http://localhost:8001/health
```

Retorno:

```json
{"ok":true,"service":"mock-meta","webhook":"http://host.docker.internal:8000/webhook"}
```

Simulação:

```bash
curl -X POST http://localhost:8001/simulate/inbound \
  -H "Content-Type: application/json" \
  -d '{ "from": "5511999990000", "text": "Quais são os planos de vocês?" }'
```

Resposta enviada ao mock:

```json
{
  "to": "5511999990000",
  "type": "text",
  "text": "Temos os planos Fibra Start 300 Mbps por R$ 79,90, Fibra Plus 600 Mbps por R$ 99,90 e Fibra Max 1 Gbps por R$ 149,90. Todos incluem Wi-Fi 6, instalação grátis e roteador em comodato.",
  "authorization": "present"
}
```

## Decisões Técnicas

Escolhi Fastify pela simplicidade e boa performance para webhooks. Usei Drizzle porque mantém o schema tipado e migrations explícitas. BullMQ foi escolhido por usar Redis já disponível no desafio e oferecer retry/backoff de forma direta. O fallback sem OpenAI permite demonstrar o fluxo completo mesmo sem credenciais reais, sem inventar informações fora da base.

## O Que Ficaria Para Depois

- Autenticação real das rotas REST, além dos headers usados no ambiente local.
- RAG com busca semântica ou embeddings para bases maiores.
- Function calling para consultar status de pedido/chamado.
- Métricas com Prometheus/OpenTelemetry.
- Dead-letter queue para falhas permanentes.
- Testes de integração com Postgres e Redis em containers.

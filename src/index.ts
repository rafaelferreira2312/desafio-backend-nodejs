import { pathToFileURL } from "node:url";

import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";

import { env } from "./config.js";
import { closeDb } from "./db/client.js";
import { logger } from "./logger.js";
import { extractInboundMessages } from "./meta/payload.js";
import { verifyMetaSignature } from "./meta/signature.js";
import { closeQueue, enqueueMessageProcessing } from "./queue/message-queue.js";
import {
  getOrCreateTenant,
  listConversationsByTenant,
  listMessagesByConversation,
  markMessageQueued,
  persistInboundMessage,
} from "./services/conversation-service.js";

type WebhookQuery = {
  "hub.challenge"?: string;
  "hub.mode"?: string;
  "hub.verify_token"?: string;
};

type ConversationParams = {
  id: string;
};

function firstHeaderValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function rawBodyFromRequest(request: FastifyRequest) {
  return Buffer.isBuffer(request.body) ? request.body : Buffer.from(String(request.body ?? ""));
}

async function resolveTenantId(request: FastifyRequest) {
  const explicitTenantId = firstHeaderValue(request.headers["x-tenant-id"]);

  if (explicitTenantId) {
    return explicitTenantId;
  }

  const phoneNumberId = firstHeaderValue(request.headers["x-phone-number-id"]) ?? env.META_PHONE_NUMBER_ID;
  const tenant = await getOrCreateTenant(phoneNumberId);

  return tenant.id;
}

export function createApp() {
  const app = Fastify({
    loggerInstance: logger,
  });

  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_request, body, done) => {
    done(null, body);
  });

  app.get("/health", async () => ({
    ok: true,
    service: "desafio-backend-nodejs",
  }));

  app.get<{ Querystring: WebhookQuery }>("/webhook", async (request, reply) => {
    const query = request.query;

    if (query["hub.mode"] === "subscribe" && query["hub.verify_token"] === env.META_VERIFY_TOKEN) {
      return reply.type("text/plain").send(query["hub.challenge"] ?? "");
    }

    return reply.code(403).send({ error: "Invalid verify token" });
  });

  app.post("/webhook", async (request, reply) => {
    const rawBody = rawBodyFromRequest(request);
    const signature = firstHeaderValue(request.headers["x-hub-signature-256"]);

    if (!verifyMetaSignature(rawBody, signature, env.META_APP_SECRET)) {
      request.log.warn({ signaturePresent: Boolean(signature) }, "Rejected webhook with invalid signature");
      return reply.code(401).send({ error: "Invalid signature" });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      return reply.code(400).send({ error: "Invalid JSON payload" });
    }

    const inboundMessages = extractInboundMessages(payload);
    let queued = 0;
    let duplicates = 0;

    for (const inbound of inboundMessages) {
      const result = await persistInboundMessage(inbound);

      if (result.duplicate) {
        duplicates += 1;
        request.log.info(
          {
            conversationId: result.conversation.id,
            messageId: result.message.id,
            tenantId: result.tenant.id,
            waMessageId: inbound.waMessageId,
          },
          "Ignored duplicated inbound message",
        );
        continue;
      }

      await enqueueMessageProcessing({
        conversationId: result.conversation.id,
        messageId: result.message.id,
        tenantId: result.tenant.id,
      });
      await markMessageQueued(result.message.id);
      queued += 1;

      request.log.info(
        {
          conversationId: result.conversation.id,
          messageId: result.message.id,
          tenantId: result.tenant.id,
          waMessageId: inbound.waMessageId,
        },
        "Queued inbound message",
      );
    }

    return reply.send({
      duplicates,
      queued,
      received: inboundMessages.length,
    });
  });

  app.get("/conversations", async (request) => {
    const tenantId = await resolveTenantId(request);
    const rows = await listConversationsByTenant(tenantId);

    return {
      data: rows.map((row) => ({
        ...row.conversation,
        contact: row.contact,
      })),
    };
  });

  app.get<{ Params: ConversationParams }>("/conversations/:id/messages", async (request, reply) => {
    const tenantId = await resolveTenantId(request);
    const data = await listMessagesByConversation(tenantId, request.params.id);

    if (!data) {
      return reply.code(404).send({ error: "Conversation not found" });
    }

    return { data };
  });

  app.addHook("onClose", async () => {
    await closeQueue();
    await closeDb();
  });

  return app;
}

async function main() {
  const app = createApp();
  await app.listen({ host: "0.0.0.0", port: env.PORT });
}

const isEntrypoint = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;

if (isEntrypoint) {
  main().catch((err) => {
    logger.error({ err }, "Failed to start HTTP server");
    process.exit(1);
  });
}

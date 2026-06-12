import { pathToFileURL } from "node:url";

import { Worker } from "bullmq";

import { closeDb } from "./db/client.js";
import { logger } from "./logger.js";
import { sendTextMessage } from "./meta/client.js";
import { closeQueue, type ProcessMessageJob, queueConnection } from "./queue/message-queue.js";
import { generateAssistantReply } from "./services/assistant-service.js";
import {
  getProcessingContext,
  markMessageFailed,
  markMessageProcessed,
  persistOutboundMessage,
} from "./services/conversation-service.js";
import { getKnowledgeContext } from "./services/knowledge-base-service.js";

export function createWorker() {
  const worker = new Worker<ProcessMessageJob, void, "process-inbound-message">(
    "message-processing",
    async (job) => {
      const { conversationId, messageId, tenantId } = job.data;
      const jobLogger = logger.child({ conversationId, jobId: job.id, messageId, tenantId });

      jobLogger.info("Processing inbound message");

      try {
        const context = await getProcessingContext(tenantId, conversationId, messageId);

        if (!context) {
          throw new Error("Processing context not found");
        }

        const knowledgeContext = await getKnowledgeContext();
        const reply = await generateAssistantReply({
          history: context.history.map((message) => ({
            body: message.body,
            direction: message.direction,
          })),
          knowledgeContext,
          userMessage: context.inboundMessage.body,
        });

        await persistOutboundMessage({
          body: reply,
          conversationId,
          tenantId,
        });

        await sendTextMessage({
          phoneNumberId: context.tenant.metaPhoneNumberId,
          text: reply,
          to: context.contact.waId,
        });

        await markMessageProcessed(messageId);
        jobLogger.info("Inbound message processed and response sent");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown worker error";
        const maxAttempts = Number(job.opts.attempts ?? 1);

        if (job.attemptsMade + 1 >= maxAttempts) {
          await markMessageFailed(messageId, message);
        }

        jobLogger.error({ err: error }, "Failed to process inbound message");
        throw error;
      }
    },
    {
      concurrency: 5,
      connection: queueConnection,
    },
  );

  worker.on("failed", (job, error) => {
    logger.error({ err: error, jobId: job?.id }, "Message processing job failed");
  });

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "Message processing job completed");
  });

  return worker;
}

async function main() {
  const worker = createWorker();

  logger.info("Message worker started");

  const shutdown = async () => {
    logger.info("Stopping message worker");
    await worker.close();
    await closeQueue();
    await closeDb();
  };

  process.once("SIGINT", () => {
    void shutdown().then(() => process.exit(0));
  });
  process.once("SIGTERM", () => {
    void shutdown().then(() => process.exit(0));
  });
}

const isEntrypoint = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;

if (isEntrypoint) {
  main().catch((err) => {
    logger.error({ err }, "Failed to start worker");
    process.exit(1);
  });
}

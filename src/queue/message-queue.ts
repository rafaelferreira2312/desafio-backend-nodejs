import { Queue } from "bullmq";

import { env } from "../config.js";

export type ProcessMessageJob = {
  conversationId: string;
  messageId: string;
  tenantId: string;
};

const redisUrl = new URL(env.REDIS_URL);

export const queueConnection = {
  host: redisUrl.hostname,
  maxRetriesPerRequest: null,
  password: redisUrl.password || undefined,
  port: Number(redisUrl.port || 6379),
  username: redisUrl.username || undefined,
};

export const messageQueue = new Queue<ProcessMessageJob, void, "process-inbound-message">("message-processing", {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      delay: 5_000,
      type: "exponential",
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

export async function enqueueMessageProcessing(job: ProcessMessageJob) {
  await messageQueue.add("process-inbound-message", job, {
    jobId: job.messageId,
  });
}

export async function closeQueue() {
  await messageQueue.close();
}

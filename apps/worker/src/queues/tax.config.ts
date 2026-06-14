import { createLoggerWithContext } from "@midday/logger";
import type { QueueOptions, WorkerOptions } from "bullmq";
import { getRedisConnection } from "../config";
import type { QueueConfig } from "../types/queue-config";

const logger = createLoggerWithContext("tax-queue");

const taxQueueOptions: QueueOptions = {
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: {
      age: 7 * 24 * 3600,
      count: 1000,
    },
    removeOnFail: {
      age: 30 * 24 * 3600,
      count: 2000,
    },
  },
};

const taxWorkerOptions: WorkerOptions = {
  connection: getRedisConnection(),
  concurrency: 2,
  lockDuration: 300000,
  stalledInterval: 360000,
  limiter: {
    max: 5,
    duration: 1000,
  },
};

export const taxQueueConfig: QueueConfig = {
  name: "tax",
  queueOptions: taxQueueOptions,
  workerOptions: taxWorkerOptions,
  eventHandlers: {
    onCompleted: (job) => {
      logger.info("Tax job completed", {
        jobName: job.name,
        jobId: job.id,
      });
    },
    onFailed: (job, err) => {
      logger.error("Tax job failed", {
        jobName: job?.name,
        jobId: job?.id,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    },
  },
};

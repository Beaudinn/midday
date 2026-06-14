import { Queue } from "bullmq";
import { taxQueueConfig } from "./tax.config";

/**
 * Tax queue instance
 * Used for enqueueing Dutch tax and Digipoort/SBR jobs.
 */
export const taxQueue = new Queue("tax", taxQueueConfig.queueOptions);

import { processTaxDigipoortJob } from "@midday/db/queries";
import type { Job } from "bullmq";
import {
  type ProcessTaxDigipoortJobPayload,
  processTaxDigipoortJobSchema,
} from "../../schemas/tax";
import { getDb } from "../../utils/db";
import { BaseProcessor } from "../base";

export class ProcessTaxDigipoortJobProcessor extends BaseProcessor<ProcessTaxDigipoortJobPayload> {
  protected getPayloadSchema() {
    return processTaxDigipoortJobSchema;
  }

  async process(job: Job<ProcessTaxDigipoortJobPayload>): Promise<void> {
    const { teamId, jobId, operation } = job.data;
    const db = getDb();

    this.logger.info("Processing tax Digipoort job", {
      teamId,
      jobId,
      operation,
    });

    const result = await processTaxDigipoortJob(db, {
      teamId,
      jobId,
    });

    this.logger.info("Tax Digipoort job processed", {
      teamId,
      jobId,
      operation,
      status: result.status,
      providerReference: result.providerReference,
    });
  }
}

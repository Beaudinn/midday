import {
  getOpenTaxMandatesForTeam,
  matchTaxMandateDocument,
} from "@midday/db/queries";
import { extractMandateActivationCode } from "@midday/documents";
import { createClient } from "@midday/supabase/job";
import type { Job } from "bullmq";
import type { MatchTaxMandateDocumentPayload } from "../../schemas/documents";
import { getDb } from "../../utils/db";
import { TIMEOUTS, withTimeout } from "../../utils/timeout";
import { BaseProcessor } from "../base";

export class MatchTaxMandateDocumentProcessor extends BaseProcessor<MatchTaxMandateDocumentPayload> {
  async process(job: Job<MatchTaxMandateDocumentPayload>): Promise<void> {
    const { teamId, filePath, mimetype, size } = job.data;
    const db = getDb();
    const fileName = filePath.join("/");

    const openMandates = await getOpenTaxMandatesForTeam(db, teamId);

    if (!openMandates.length) {
      this.logger.info(
        "Skipping tax mandate document match: no open mandates",
        {
          teamId,
          fileName,
        },
      );
      return;
    }

    const mandateTypes = [
      ...new Set(openMandates.map((mandate) => mandate.mandateType)),
    ];
    const expectedMandateType =
      mandateTypes.length === 1 ? mandateTypes.at(0) : null;

    const supabase = createClient();
    const { data } = await withTimeout(
      supabase.storage.from("vault").download(fileName),
      TIMEOUTS.FILE_DOWNLOAD,
      `File download timed out after ${TIMEOUTS.FILE_DOWNLOAD}ms`,
    );

    if (!data) {
      this.logger.warn("Skipping tax mandate document match: file not found", {
        teamId,
        fileName,
      });
      return;
    }

    try {
      const extraction = await withTimeout(
        extractMandateActivationCode({
          content: data,
          mimetype: mimetype || data.type || "application/octet-stream",
          expectedMandateType,
        }),
        TIMEOUTS.AI_CLASSIFICATION,
        `Tax mandate extraction timed out after ${TIMEOUTS.AI_CLASSIFICATION}ms`,
      );

      const result = await matchTaxMandateDocument(db, {
        teamId,
        filePathTokens: filePath,
        mimetype: mimetype || data.type || "application/octet-stream",
        size: size ?? data.size,
        extraction: {
          activationCode: extraction.activationCode,
          mandateType: extraction.mandateType,
          taxYear: extraction.taxYear,
          confidence: extraction.confidence,
          reason: extraction.reason,
          rawExtraction: extraction,
        },
      });

      this.logger.info("Tax mandate document match completed", {
        teamId,
        fileName,
        matched: result.matched,
        reason: "reason" in result ? result.reason : undefined,
        mandateId: "mandateId" in result ? result.mandateId : undefined,
        status: "status" in result ? result.status : undefined,
      });
    } catch (error) {
      this.logger.warn("Tax mandate document matching skipped after error", {
        teamId,
        fileName,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
}

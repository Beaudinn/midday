import {
  getOpenTaxIntakeDocumentContextsForTeam,
  getTaxDocumentForPath,
  matchTaxIntakeDocument,
} from "@midday/db/queries";
import { extractTaxIntakeFactsFromDocument } from "@midday/documents";
import type { Job } from "bullmq";
import type { MatchTaxIntakeDocumentPayload } from "../../schemas/documents";
import { getDb } from "../../utils/db";
import { BaseProcessor } from "../base";

export class MatchTaxIntakeDocumentProcessor extends BaseProcessor<MatchTaxIntakeDocumentPayload> {
  async process(job: Job<MatchTaxIntakeDocumentPayload>): Promise<void> {
    const { teamId, filePath } = job.data;
    const db = getDb();
    const fileName = filePath.join("/");

    const openIntakes = await getOpenTaxIntakeDocumentContextsForTeam(
      db,
      teamId,
    );

    if (!openIntakes.length) {
      this.logger.info("Skipping tax intake document match: no open intakes", {
        teamId,
        fileName,
      });
      return;
    }

    const document = await getTaxDocumentForPath(db, {
      teamId,
      filePathTokens: filePath,
    });

    if (!document) {
      this.logger.warn("Skipping tax intake document match: document missing", {
        teamId,
        fileName,
      });
      return;
    }

    const extraction = extractTaxIntakeFactsFromDocument({
      title: document.title,
      summary: document.summary,
      content: document.content,
      date: document.date,
      expectedTaxYears: openIntakes.map((intake) => intake.taxYear),
    });

    if (!extraction.sectionKey && extraction.suggestedAnswers.length === 0) {
      this.logger.info("Skipping tax intake document match: no facts found", {
        teamId,
        fileName,
      });
      return;
    }

    const result = await matchTaxIntakeDocument(db, {
      teamId,
      filePathTokens: filePath,
      extraction,
    });

    this.logger.info("Tax intake document match completed", {
      teamId,
      fileName,
      matched: result.matched,
      reason: "reason" in result ? result.reason : undefined,
      intakeId: "intakeId" in result ? result.intakeId : undefined,
      suggestedAnswerCount:
        "suggestedAnswerCount" in result
          ? result.suggestedAnswerCount
          : undefined,
    });
  }
}

import { decrypt, encrypt } from "@midday/encryption";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "../client";
import {
  documents,
  taxClientSubjects,
  taxClients,
  taxDigipoortJobs,
  taxEntitlements,
  taxMandateDocumentMatches,
  taxMandates,
  taxServiceProducts,
  taxSubjects,
  taxTasks,
  teams,
  usersOnTeam,
} from "../schema";

export type TaxClientKind = typeof taxClients.$inferSelect.clientKind;
export type TaxServiceProductCode =
  | "vat_return"
  | "income_tax_private"
  | "income_tax_entrepreneur"
  | "via_retrieval"
  | "sba_monitoring";
export type TaxMandateType = typeof taxMandates.$inferSelect.mandateType;
export type TaxDigipoortOperation =
  typeof taxDigipoortJobs.$inferSelect.operation;
export type TaxDigipoortJobExecutionContext = {
  job: typeof taxDigipoortJobs.$inferSelect;
  mandate: {
    id: string;
    mandateType: TaxMandateType;
    taxYear: number | null;
    status: typeof taxMandates.$inferSelect.status;
    activationCode: string | null;
  };
  subject: {
    id: string;
    subjectType: typeof taxSubjects.$inferSelect.subjectType;
    displayName: string;
    countryCode: string;
    bsn: string | null;
    rsin: string | null;
    kvkNumber: string | null;
    vatNumber: string | null;
  };
};
export type TaxDigipoortJobExecutionResult = {
  providerReference?: string | null;
  result?: Record<string, unknown>;
};
export type TaxDigipoortJobExecutor = (
  context: TaxDigipoortJobExecutionContext,
) => Promise<TaxDigipoortJobExecutionResult>;
export type TaxMandateDocumentExtraction = {
  activationCode: string | null;
  mandateType: TaxMandateType | null;
  taxYear?: number | null;
  confidence?: number | null;
  reason?: string | null;
  rawExtraction?: Record<string, unknown>;
};

const taxMandateTypes = new Set<TaxMandateType>(["VIA", "SBA", "BTW", "IB"]);
const openMandateStatuses = [
  "draft",
  "requested",
  "letter_sent",
  "activation_required",
] as const;

function toTaxMandateType(value: string): TaxMandateType | null {
  return taxMandateTypes.has(value as TaxMandateType)
    ? (value as TaxMandateType)
    : null;
}

function mandateTaskTitle(mandateType: TaxMandateType) {
  switch (mandateType) {
    case "BTW":
      return "Activate VAT authorization";
    case "IB":
      return "Activate income tax authorization";
    case "SBA":
      return "Activate SBA service messages";
    case "VIA":
      return "Activate VIA retrieval";
  }
}

function mandateTaskDescription(mandateType: TaxMandateType) {
  switch (mandateType) {
    case "BTW":
      return "Enter the activation code or authorization details for VAT return filing.";
    case "IB":
      return "Enter the activation code or authorization details for income tax filing.";
    case "SBA":
      return "Enter the activation code for service messages after the authorization letter is received.";
    case "VIA":
      return "Enter the activation code for pre-filled tax data retrieval after the authorization letter is received.";
  }
}

function mandateTaskDueDate() {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);

  return dueDate.toISOString().slice(0, 10);
}

function mandateNeedsTask(status: typeof taxMandates.$inferSelect.status) {
  return ["draft", "requested", "letter_sent", "activation_required"].includes(
    status,
  );
}

function activationCodePreview(code: string) {
  return `...${code.slice(-4)}`;
}

function confidencePercent(confidence?: number | null) {
  if (confidence === null || confidence === undefined) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(confidence * 100)));
}

function scoreMandateDocumentMatch(
  mandate: {
    mandateType: TaxMandateType;
    taxYear: number | null;
    taskId: string | null;
  },
  extraction: TaxMandateDocumentExtraction,
) {
  const confidence = confidencePercent(extraction.confidence) ?? 0;

  if (
    extraction.mandateType &&
    extraction.mandateType !== mandate.mandateType
  ) {
    return -1;
  }

  if (
    extraction.taxYear &&
    mandate.taxYear &&
    extraction.taxYear !== mandate.taxYear
  ) {
    return -1;
  }

  let score = confidence;

  if (extraction.mandateType === mandate.mandateType) {
    score += 30;
  }

  if (!extraction.mandateType) {
    score += 5;
  }

  if (extraction.taxYear && extraction.taxYear === mandate.taxYear) {
    score += 20;
  }

  if (mandate.taskId) {
    score += 5;
  }

  return score;
}

function subjectTypeForClientKind(clientKind: TaxClientKind) {
  switch (clientKind) {
    case "company":
      return "company";
    case "sole_proprietor":
      return "sole_proprietor";
    default:
      return "private_person";
  }
}

function subjectRoleForClientKind(clientKind: TaxClientKind) {
  return clientKind === "company" ? "business_entity" : "primary";
}

export function defaultTaxClientKindForWorkspace(
  workspaceType: "business" | "personal" | "household",
): TaxClientKind {
  switch (workspaceType) {
    case "personal":
      return "private_person";
    case "household":
      return "household";
    default:
      return "sole_proprietor";
  }
}

export async function getTaxServiceProducts(db: Database) {
  return db
    .select({
      id: taxServiceProducts.id,
      code: taxServiceProducts.code,
      name: taxServiceProducts.name,
      requiredMandates: taxServiceProducts.requiredMandates,
      defaultReturnType: taxServiceProducts.defaultReturnType,
      includedInPlans: taxServiceProducts.includedInPlans,
      active: taxServiceProducts.active,
    })
    .from(taxServiceProducts)
    .where(eq(taxServiceProducts.active, true));
}

export async function getTaxClientByTeamId(db: Database, teamId: string) {
  const [client] = await db
    .select()
    .from(taxClients)
    .where(eq(taxClients.teamId, teamId))
    .limit(1);

  if (!client) {
    return null;
  }

  const [subjects, entitlements, mandates, tasks, documentMatches] =
    await Promise.all([
      db
        .select({
          id: taxSubjects.id,
          displayName: taxSubjects.displayName,
          subjectType: taxSubjects.subjectType,
          countryCode: taxSubjects.countryCode,
          kvkNumber: taxSubjects.kvkNumber,
          vatNumber: taxSubjects.vatNumber,
          hasBsn: sql<boolean>`${taxSubjects.encryptedBsn} is not null`,
          hasRsin: sql<boolean>`${taxSubjects.encryptedRsin} is not null`,
          role: taxClientSubjects.role,
          accessStatus: taxClientSubjects.accessStatus,
        })
        .from(taxClientSubjects)
        .innerJoin(taxSubjects, eq(taxSubjects.id, taxClientSubjects.subjectId))
        .where(eq(taxClientSubjects.clientId, client.id)),
      db
        .select({
          id: taxEntitlements.id,
          status: taxEntitlements.status,
          source: taxEntitlements.source,
          productCode: taxServiceProducts.code,
          productName: taxServiceProducts.name,
        })
        .from(taxEntitlements)
        .innerJoin(
          taxServiceProducts,
          eq(taxServiceProducts.id, taxEntitlements.productId),
        )
        .where(eq(taxEntitlements.clientId, client.id)),
      db
        .select({
          id: taxMandates.id,
          subjectId: taxMandates.subjectId,
          entitlementId: taxMandates.entitlementId,
          mandateType: taxMandates.mandateType,
          status: taxMandates.status,
          taxYear: taxMandates.taxYear,
          requestedAt: taxMandates.requestedAt,
          activatedAt: taxMandates.activatedAt,
          expiresAt: taxMandates.expiresAt,
        })
        .from(taxMandates)
        .where(eq(taxMandates.clientId, client.id)),
      db
        .select({
          id: taxTasks.id,
          subjectId: taxTasks.subjectId,
          mandateId: taxTasks.mandateId,
          title: taxTasks.title,
          description: taxTasks.description,
          status: taxTasks.status,
          dueDate: taxTasks.dueDate,
          createdAt: taxTasks.createdAt,
          resolvedAt: taxTasks.resolvedAt,
        })
        .from(taxTasks)
        .where(eq(taxTasks.clientId, client.id)),
      db
        .select({
          id: taxMandateDocumentMatches.id,
          mandateId: taxMandateDocumentMatches.mandateId,
          taskId: taxMandateDocumentMatches.taskId,
          documentId: taxMandateDocumentMatches.documentId,
          documentTitle: documents.title,
          documentDate: documents.date,
          filePathTokens: taxMandateDocumentMatches.filePathTokens,
          mimetype: taxMandateDocumentMatches.mimetype,
          status: taxMandateDocumentMatches.status,
          extractedCodePreview: taxMandateDocumentMatches.extractedCodePreview,
          extractedMandateType: taxMandateDocumentMatches.extractedMandateType,
          extractedTaxYear: taxMandateDocumentMatches.extractedTaxYear,
          extractionConfidence: taxMandateDocumentMatches.extractionConfidence,
          extractionReason: taxMandateDocumentMatches.extractionReason,
          matchedAt: taxMandateDocumentMatches.matchedAt,
          confirmedAt: taxMandateDocumentMatches.confirmedAt,
          createdAt: taxMandateDocumentMatches.createdAt,
        })
        .from(taxMandateDocumentMatches)
        .leftJoin(
          documents,
          eq(documents.id, taxMandateDocumentMatches.documentId),
        )
        .where(eq(taxMandateDocumentMatches.clientId, client.id)),
    ]);

  const digipoortJobs = await db
    .select({
      id: taxDigipoortJobs.id,
      mandateId: taxDigipoortJobs.mandateId,
      serviceOrderId: taxDigipoortJobs.serviceOrderId,
      operation: taxDigipoortJobs.operation,
      status: taxDigipoortJobs.status,
      providerReference: taxDigipoortJobs.providerReference,
      error: taxDigipoortJobs.error,
      attempts: taxDigipoortJobs.attempts,
      queuedAt: taxDigipoortJobs.queuedAt,
      startedAt: taxDigipoortJobs.startedAt,
      completedAt: taxDigipoortJobs.completedAt,
      createdAt: taxDigipoortJobs.createdAt,
    })
    .from(taxDigipoortJobs)
    .where(eq(taxDigipoortJobs.clientId, client.id))
    .orderBy(desc(taxDigipoortJobs.createdAt))
    .limit(25);

  return {
    ...client,
    subjects,
    entitlements,
    mandates,
    tasks,
    documentMatches,
    digipoortJobs,
  };
}

export async function getOpenTaxMandatesForTeam(db: Database, teamId: string) {
  return db
    .select({
      id: taxMandates.id,
      clientId: taxMandates.clientId,
      teamId: taxMandates.teamId,
      subjectId: taxMandates.subjectId,
      mandateType: taxMandates.mandateType,
      taxYear: taxMandates.taxYear,
      status: taxMandates.status,
      taskId: taxTasks.id,
    })
    .from(taxMandates)
    .leftJoin(
      taxTasks,
      and(
        eq(taxTasks.mandateId, taxMandates.id),
        inArray(taxTasks.status, ["open", "answered"]),
      ),
    )
    .where(
      and(
        eq(taxMandates.teamId, teamId),
        inArray(taxMandates.status, [...openMandateStatuses]),
      ),
    );
}

export async function matchTaxMandateDocument(
  db: Database,
  params: {
    teamId: string;
    filePathTokens: string[];
    mimetype: string;
    size?: number | null;
    uploadedByUserId?: string | null;
    extraction: TaxMandateDocumentExtraction;
  },
) {
  const [client] = await db
    .select({
      id: taxClients.id,
    })
    .from(taxClients)
    .where(eq(taxClients.teamId, params.teamId))
    .limit(1);

  if (!client) {
    return { matched: false, reason: "No tax client found." };
  }

  if (!params.extraction.activationCode) {
    return { matched: false, reason: "No activation code extracted." };
  }

  const [document] = await db
    .select({
      id: documents.id,
      date: documents.date,
    })
    .from(documents)
    .where(
      and(
        eq(documents.teamId, params.teamId),
        eq(documents.pathTokens, params.filePathTokens),
      ),
    )
    .limit(1);

  const openMandates = await getOpenTaxMandatesForTeam(db, params.teamId);

  if (!openMandates.length) {
    return { matched: false, reason: "No open tax mandates found." };
  }

  const rankedMandates = openMandates
    .map((mandate) => ({
      mandate,
      score: scoreMandateDocumentMatch(mandate, params.extraction),
    }))
    .filter((candidate) => candidate.score >= 0)
    .sort((a, b) => b.score - a.score);

  const best = rankedMandates.at(0);

  if (!best || best.score < 55) {
    return { matched: false, reason: "No open mandate matched confidently." };
  }

  const matchingMandates = rankedMandates.map(({ mandate }) => mandate);
  const matchingTaxYears = new Set(
    matchingMandates
      .map((mandate) => mandate.taxYear)
      .filter((taxYear): taxYear is number => taxYear !== null),
  );

  if (!params.extraction.taxYear && matchingTaxYears.size > 1) {
    return {
      matched: false,
      reason: "Multiple open tax years matched; tax year is required.",
    };
  }

  const topRankedMandates = rankedMandates.filter(
    (candidate) => candidate.score === best.score,
  );

  if (topRankedMandates.length > 1) {
    return {
      matched: false,
      reason: "Multiple open mandates matched equally.",
    };
  }

  const now = new Date().toISOString();
  const extractionConfidence = confidencePercent(params.extraction.confidence);
  const status =
    extractionConfidence !== null && extractionConfidence >= 70
      ? "matched"
      : "needs_review";
  const encryptedCode = encrypt(params.extraction.activationCode);
  const matchValues = {
    clientId: client.id,
    teamId: params.teamId,
    mandateId: best.mandate.id,
    taskId: best.mandate.taskId,
    documentId: document?.id ?? null,
    uploadedByUserId: params.uploadedByUserId ?? null,
    filePathTokens: params.filePathTokens,
    mimetype: params.mimetype,
    size: params.size ?? null,
    status,
    extractedCodeEncrypted: encryptedCode,
    extractedCodePreview: activationCodePreview(
      params.extraction.activationCode,
    ),
    extractedMandateType: params.extraction.mandateType,
    extractedTaxYear: params.extraction.taxYear ?? null,
    extractionConfidence,
    extractionReason: params.extraction.reason ?? null,
    rawExtraction: {
      ...(params.extraction.rawExtraction ?? {}),
      documentDate: document?.date ?? null,
      matchScore: best.score,
    },
    matchedAt: now,
    updatedAt: now,
  } satisfies typeof taxMandateDocumentMatches.$inferInsert;

  const [existingMatch] = await db
    .select({
      id: taxMandateDocumentMatches.id,
    })
    .from(taxMandateDocumentMatches)
    .where(
      and(
        eq(taxMandateDocumentMatches.teamId, params.teamId),
        eq(taxMandateDocumentMatches.mandateId, best.mandate.id),
        eq(taxMandateDocumentMatches.filePathTokens, params.filePathTokens),
      ),
    )
    .limit(1);

  const [documentMatch] = existingMatch
    ? await db
        .update(taxMandateDocumentMatches)
        .set(matchValues)
        .where(eq(taxMandateDocumentMatches.id, existingMatch.id))
        .returning()
    : await db
        .insert(taxMandateDocumentMatches)
        .values(matchValues)
        .returning();

  if (!documentMatch) {
    throw new Error("Failed to store tax mandate document match");
  }

  if (status === "matched") {
    await db
      .update(taxMandates)
      .set({
        status: "activation_required",
        activationCodeEncrypted: encryptedCode,
        updatedAt: now,
      })
      .where(eq(taxMandates.id, best.mandate.id));

    if (best.mandate.taskId) {
      await db
        .update(taxTasks)
        .set({
          status: "answered",
          updatedAt: now,
        })
        .where(eq(taxTasks.id, best.mandate.taskId));
    }
  }

  return {
    matched: true,
    documentMatch,
    mandateId: best.mandate.id,
    taskId: best.mandate.taskId,
    score: best.score,
    status,
  };
}

export async function confirmTaxMandateDocumentMatch(
  db: Database,
  params: {
    teamId: string;
    matchId: string;
  },
) {
  return db.transaction(async (tx) => {
    const [match] = await tx
      .select({
        id: taxMandateDocumentMatches.id,
        teamId: taxMandateDocumentMatches.teamId,
        mandateId: taxMandateDocumentMatches.mandateId,
        taskId: taxMandateDocumentMatches.taskId,
        status: taxMandateDocumentMatches.status,
        confirmedAt: taxMandateDocumentMatches.confirmedAt,
      })
      .from(taxMandateDocumentMatches)
      .where(
        and(
          eq(taxMandateDocumentMatches.id, params.matchId),
          eq(taxMandateDocumentMatches.teamId, params.teamId),
        ),
      )
      .limit(1);

    if (!match) {
      throw new Error("Tax mandate document match not found");
    }

    if (!["matched", "needs_review", "confirmed"].includes(match.status)) {
      throw new Error("Tax mandate document match is not ready to confirm");
    }

    const [existingMandate] = await tx
      .select({
        id: taxMandates.id,
        activatedAt: taxMandates.activatedAt,
      })
      .from(taxMandates)
      .where(
        and(
          eq(taxMandates.id, match.mandateId),
          eq(taxMandates.teamId, params.teamId),
        ),
      )
      .limit(1);

    if (!existingMandate) {
      throw new Error("Tax mandate not found for document match");
    }

    const now = new Date().toISOString();
    const [documentMatch] = await tx
      .update(taxMandateDocumentMatches)
      .set({
        status: "confirmed",
        confirmedAt: match.confirmedAt ?? now,
        updatedAt: now,
      })
      .where(eq(taxMandateDocumentMatches.id, match.id))
      .returning();

    const [mandate] = await tx
      .update(taxMandates)
      .set({
        status: "active",
        activatedAt: existingMandate.activatedAt ?? now,
        updatedAt: now,
      })
      .where(eq(taxMandates.id, match.mandateId))
      .returning();

    let task: typeof taxTasks.$inferSelect | null = null;

    if (match.taskId) {
      const [updatedTask] = await tx
        .update(taxTasks)
        .set({
          status: "resolved",
          resolvedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(taxTasks.id, match.taskId),
            eq(taxTasks.teamId, params.teamId),
          ),
        )
        .returning();

      task = updatedTask ?? null;
    }

    if (!documentMatch || !mandate) {
      throw new Error("Failed to confirm tax mandate document match");
    }

    return {
      documentMatch,
      mandate,
      task,
    };
  });
}

function shouldDryRunDigipoort() {
  return (
    process.env.DIGIPOORT_DRY_RUN === "true" ||
    (process.env.NODE_ENV !== "production" &&
      process.env.DIGIPOORT_DRY_RUN !== "false")
  );
}

function getPayloadString(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];

  return typeof value === "string" ? value : null;
}

export async function queueTaxDigipoortMandateRequest(
  db: Database,
  params: {
    teamId: string;
    mandateId: string;
  },
) {
  const [mandate] = await db
    .select({
      id: taxMandates.id,
      clientId: taxMandates.clientId,
      teamId: taxMandates.teamId,
      subjectId: taxMandates.subjectId,
      mandateType: taxMandates.mandateType,
      taxYear: taxMandates.taxYear,
      status: taxMandates.status,
    })
    .from(taxMandates)
    .where(
      and(
        eq(taxMandates.id, params.mandateId),
        eq(taxMandates.teamId, params.teamId),
      ),
    )
    .limit(1);

  if (!mandate) {
    throw new Error("Tax mandate not found");
  }

  if (["active", "rejected", "expired", "revoked"].includes(mandate.status)) {
    throw new Error("Tax mandate cannot be requested in its current status");
  }

  const [existingJob] = await db
    .select()
    .from(taxDigipoortJobs)
    .where(
      and(
        eq(taxDigipoortJobs.teamId, params.teamId),
        eq(taxDigipoortJobs.mandateId, params.mandateId),
        eq(taxDigipoortJobs.operation, "request_mandate"),
        inArray(taxDigipoortJobs.status, ["queued", "processing"]),
      ),
    )
    .orderBy(desc(taxDigipoortJobs.createdAt))
    .limit(1);

  if (existingJob) {
    return existingJob;
  }

  const now = new Date().toISOString();
  const [job] = await db
    .insert(taxDigipoortJobs)
    .values({
      clientId: mandate.clientId,
      teamId: mandate.teamId,
      mandateId: mandate.id,
      operation: "request_mandate",
      status: "queued",
      payload: {
        mandateType: mandate.mandateType,
        taxYear: mandate.taxYear,
        subjectId: mandate.subjectId,
      },
      queuedAt: now,
      updatedAt: now,
    })
    .returning();

  if (!job) {
    throw new Error("Failed to queue Digipoort mandate request");
  }

  if (mandate.status === "draft") {
    await db
      .update(taxMandates)
      .set({
        status: "requested",
        requestedAt: now,
        updatedAt: now,
      })
      .where(eq(taxMandates.id, mandate.id));
  }

  return job;
}

export async function updateTaxSubjectIdentityForTeam(
  db: Database,
  params: {
    teamId: string;
    subjectId: string;
    displayName?: string;
    countryCode?: string;
    bsn?: string | null;
    rsin?: string | null;
    kvkNumber?: string | null;
    vatNumber?: string | null;
  },
) {
  const [subjectLink] = await db
    .select({
      subjectId: taxClientSubjects.subjectId,
    })
    .from(taxClientSubjects)
    .where(
      and(
        eq(taxClientSubjects.teamId, params.teamId),
        eq(taxClientSubjects.subjectId, params.subjectId),
        eq(taxClientSubjects.accessStatus, "active"),
      ),
    )
    .limit(1);

  if (!subjectLink) {
    throw new Error("Tax subject not found for this team");
  }

  const values: Partial<typeof taxSubjects.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };

  if (params.displayName !== undefined) {
    values.displayName = params.displayName.trim();
  }

  if (params.countryCode !== undefined) {
    values.countryCode = params.countryCode.trim().toUpperCase();
  }

  if (params.bsn !== undefined) {
    const bsn = params.bsn?.trim();
    values.encryptedBsn = bsn ? encrypt(bsn) : null;
  }

  if (params.rsin !== undefined) {
    const rsin = params.rsin?.trim();
    values.encryptedRsin = rsin ? encrypt(rsin) : null;
  }

  if (params.kvkNumber !== undefined) {
    values.kvkNumber = params.kvkNumber?.trim() || null;
  }

  if (params.vatNumber !== undefined) {
    values.vatNumber = params.vatNumber?.trim().toUpperCase() || null;
  }

  const [subject] = await db
    .update(taxSubjects)
    .set(values)
    .where(eq(taxSubjects.id, params.subjectId))
    .returning({
      id: taxSubjects.id,
      displayName: taxSubjects.displayName,
      subjectType: taxSubjects.subjectType,
      countryCode: taxSubjects.countryCode,
      kvkNumber: taxSubjects.kvkNumber,
      vatNumber: taxSubjects.vatNumber,
      hasBsn: sql<boolean>`${taxSubjects.encryptedBsn} is not null`,
      hasRsin: sql<boolean>`${taxSubjects.encryptedRsin} is not null`,
    });

  if (!subject) {
    throw new Error("Failed to update tax subject");
  }

  return subject;
}

export async function queueTaxDigipoortMandateActivation(
  db: Database,
  params: {
    teamId: string;
    matchId: string;
  },
) {
  return db.transaction(async (tx) => {
    const [match] = await tx
      .select({
        id: taxMandateDocumentMatches.id,
        clientId: taxMandateDocumentMatches.clientId,
        teamId: taxMandateDocumentMatches.teamId,
        mandateId: taxMandateDocumentMatches.mandateId,
        taskId: taxMandateDocumentMatches.taskId,
        documentId: taxMandateDocumentMatches.documentId,
        status: taxMandateDocumentMatches.status,
        extractedCodeEncrypted:
          taxMandateDocumentMatches.extractedCodeEncrypted,
        extractedMandateType: taxMandateDocumentMatches.extractedMandateType,
        extractedTaxYear: taxMandateDocumentMatches.extractedTaxYear,
      })
      .from(taxMandateDocumentMatches)
      .where(
        and(
          eq(taxMandateDocumentMatches.id, params.matchId),
          eq(taxMandateDocumentMatches.teamId, params.teamId),
        ),
      )
      .limit(1);

    if (!match) {
      throw new Error("Tax mandate document match not found");
    }

    if (!["matched", "needs_review"].includes(match.status)) {
      throw new Error("Tax mandate document match is not ready to activate");
    }

    if (!match.extractedCodeEncrypted) {
      throw new Error("Tax mandate document match has no activation code");
    }

    const [mandate] = await tx
      .select({
        id: taxMandates.id,
        subjectId: taxMandates.subjectId,
        mandateType: taxMandates.mandateType,
        taxYear: taxMandates.taxYear,
        status: taxMandates.status,
      })
      .from(taxMandates)
      .where(
        and(
          eq(taxMandates.id, match.mandateId),
          eq(taxMandates.teamId, params.teamId),
        ),
      )
      .limit(1);

    if (!mandate) {
      throw new Error("Tax mandate not found for document match");
    }

    if (["active", "rejected", "expired", "revoked"].includes(mandate.status)) {
      throw new Error("Tax mandate cannot be activated in its current status");
    }

    const [existingJob] = await tx
      .select()
      .from(taxDigipoortJobs)
      .where(
        and(
          eq(taxDigipoortJobs.teamId, params.teamId),
          eq(taxDigipoortJobs.mandateId, match.mandateId),
          eq(taxDigipoortJobs.operation, "activate_mandate"),
          inArray(taxDigipoortJobs.status, ["queued", "processing"]),
        ),
      )
      .orderBy(desc(taxDigipoortJobs.createdAt))
      .limit(1);

    if (existingJob) {
      return existingJob;
    }

    const now = new Date().toISOString();

    await tx
      .update(taxMandates)
      .set({
        status: "activation_required",
        activationCodeEncrypted: match.extractedCodeEncrypted,
        updatedAt: now,
      })
      .where(eq(taxMandates.id, match.mandateId));

    if (match.taskId) {
      await tx
        .update(taxTasks)
        .set({
          status: "answered",
          updatedAt: now,
        })
        .where(
          and(
            eq(taxTasks.id, match.taskId),
            eq(taxTasks.teamId, params.teamId),
            eq(taxTasks.status, "open"),
          ),
        );
    }

    const [job] = await tx
      .insert(taxDigipoortJobs)
      .values({
        clientId: match.clientId,
        teamId: match.teamId,
        mandateId: match.mandateId,
        operation: "activate_mandate",
        status: "queued",
        payload: {
          matchId: match.id,
          documentId: match.documentId,
          mandateType: match.extractedMandateType ?? mandate.mandateType,
          taxYear: match.extractedTaxYear ?? mandate.taxYear,
          subjectId: mandate.subjectId,
          codeSource: "mandate_document_match",
        },
        queuedAt: now,
        updatedAt: now,
      })
      .returning();

    if (!job) {
      throw new Error("Failed to queue Digipoort mandate activation");
    }

    return job;
  });
}

export async function processTaxDigipoortJob(
  db: Database,
  params: {
    teamId: string;
    jobId: string;
    executor?: TaxDigipoortJobExecutor;
  },
) {
  const [job] = await db
    .select()
    .from(taxDigipoortJobs)
    .where(
      and(
        eq(taxDigipoortJobs.id, params.jobId),
        eq(taxDigipoortJobs.teamId, params.teamId),
      ),
    )
    .limit(1);

  if (!job) {
    throw new Error("Digipoort job not found");
  }

  if (job.status === "completed") {
    return job;
  }

  const startedAt = new Date().toISOString();

  await db
    .update(taxDigipoortJobs)
    .set({
      status: "processing",
      attempts: job.attempts + 1,
      startedAt,
      completedAt: null,
      updatedAt: startedAt,
      error: null,
    })
    .where(eq(taxDigipoortJobs.id, job.id));

  try {
    if (!job.mandateId) {
      throw new Error(`Digipoort ${job.operation} job has no mandate id`);
    }

    const [mandateContext] = await db
      .select({
        mandateId: taxMandates.id,
        mandateType: taxMandates.mandateType,
        taxYear: taxMandates.taxYear,
        mandateStatus: taxMandates.status,
        activationCodeEncrypted: taxMandates.activationCodeEncrypted,
        subjectId: taxSubjects.id,
        subjectType: taxSubjects.subjectType,
        displayName: taxSubjects.displayName,
        encryptedBsn: taxSubjects.encryptedBsn,
        encryptedRsin: taxSubjects.encryptedRsin,
        kvkNumber: taxSubjects.kvkNumber,
        vatNumber: taxSubjects.vatNumber,
        countryCode: taxSubjects.countryCode,
      })
      .from(taxMandates)
      .innerJoin(taxSubjects, eq(taxSubjects.id, taxMandates.subjectId))
      .where(
        and(
          eq(taxMandates.id, job.mandateId),
          eq(taxMandates.teamId, params.teamId),
        ),
      )
      .limit(1);

    if (!mandateContext) {
      throw new Error("Digipoort mandate context not found");
    }

    const completedAt = new Date().toISOString();
    const dryRun = shouldDryRunDigipoort();
    const executionContext: TaxDigipoortJobExecutionContext = {
      job,
      mandate: {
        id: mandateContext.mandateId,
        mandateType: mandateContext.mandateType,
        taxYear: mandateContext.taxYear,
        status: mandateContext.mandateStatus,
        activationCode:
          !dryRun && mandateContext.activationCodeEncrypted
            ? decrypt(mandateContext.activationCodeEncrypted)
            : null,
      },
      subject: {
        id: mandateContext.subjectId,
        subjectType: mandateContext.subjectType,
        displayName: mandateContext.displayName,
        countryCode: mandateContext.countryCode,
        bsn:
          !dryRun && mandateContext.encryptedBsn
            ? decrypt(mandateContext.encryptedBsn)
            : null,
        rsin:
          !dryRun && mandateContext.encryptedRsin
            ? decrypt(mandateContext.encryptedRsin)
            : null,
        kvkNumber: mandateContext.kvkNumber,
        vatNumber: mandateContext.vatNumber,
      },
    };
    const execution = dryRun
      ? {
          providerReference: `dry-run:${job.operation}:${job.id}`,
          result: {
            dryRun: true,
            accepted: true,
            providerReference: `dry-run:${job.operation}:${job.id}`,
            message:
              "Dry-run Digipoort job accepted. Configure the WUS/SBR client for real processing.",
          },
        }
      : await (async () => {
          if (!params.executor) {
            throw new Error(
              "Digipoort executor is not configured. Set DIGIPOORT_DRY_RUN=true for development or configure the worker Digipoort client.",
            );
          }

          return params.executor(executionContext);
        })();
    const providerReference =
      execution.providerReference ?? `digipoort:${job.operation}:${job.id}`;
    const result = {
      accepted: true,
      providerReference,
      ...(execution.result ?? {}),
    };

    if (job.operation === "request_mandate") {
      await db
        .update(taxMandates)
        .set({
          status: "letter_sent",
          externalReference: providerReference,
          updatedAt: completedAt,
        })
        .where(eq(taxMandates.id, job.mandateId));
    }

    if (job.operation === "activate_mandate") {
      const matchId = getPayloadString(job.payload, "matchId");

      await db
        .update(taxMandates)
        .set({
          status: "active",
          externalReference: providerReference,
          activatedAt: completedAt,
          updatedAt: completedAt,
        })
        .where(eq(taxMandates.id, job.mandateId));

      await db
        .update(taxTasks)
        .set({
          status: "resolved",
          resolvedAt: completedAt,
          updatedAt: completedAt,
        })
        .where(
          and(
            eq(taxTasks.teamId, params.teamId),
            eq(taxTasks.mandateId, job.mandateId),
            inArray(taxTasks.status, ["open", "answered"]),
          ),
        );

      if (matchId) {
        await db
          .update(taxMandateDocumentMatches)
          .set({
            status: "confirmed",
            confirmedAt: completedAt,
            updatedAt: completedAt,
          })
          .where(
            and(
              eq(taxMandateDocumentMatches.id, matchId),
              eq(taxMandateDocumentMatches.teamId, params.teamId),
            ),
          );
      }
    }

    const [completedJob] = await db
      .update(taxDigipoortJobs)
      .set({
        status: "completed",
        providerReference,
        result,
        completedAt,
        updatedAt: completedAt,
      })
      .where(eq(taxDigipoortJobs.id, job.id))
      .returning();

    if (!completedJob) {
      throw new Error("Failed to complete Digipoort job");
    }

    return completedJob;
  } catch (error) {
    const failedAt = new Date().toISOString();
    const message =
      error instanceof Error ? error.message : "Unknown Digipoort error";

    await db
      .update(taxDigipoortJobs)
      .set({
        status: "failed",
        error: message,
        completedAt: failedAt,
        updatedAt: failedAt,
      })
      .where(eq(taxDigipoortJobs.id, job.id));

    throw error;
  }
}

export async function ensureTaxClientForTeam(
  db: Database,
  params: {
    teamId: string;
    clientKind?: TaxClientKind;
    assignedStaffUserId?: string | null;
  },
) {
  return db.transaction(async (tx) => {
    const [team] = await tx
      .select({
        id: teams.id,
        name: teams.name,
        countryCode: teams.countryCode,
        workspaceType: teams.workspaceType,
      })
      .from(teams)
      .where(eq(teams.id, params.teamId))
      .limit(1);

    if (!team) {
      throw new Error("Team not found");
    }

    const clientKind =
      params.clientKind ?? defaultTaxClientKindForWorkspace(team.workspaceType);

    const [primaryMember] = await tx
      .select({ userId: usersOnTeam.userId })
      .from(usersOnTeam)
      .where(eq(usersOnTeam.teamId, params.teamId))
      .limit(1);

    const [existingClient] = await tx
      .select()
      .from(taxClients)
      .where(eq(taxClients.teamId, params.teamId))
      .limit(1);

    const [client] = existingClient
      ? await tx
          .update(taxClients)
          .set({
            clientKind,
            status: "active",
            assignedStaffUserId:
              existingClient.assignedStaffUserId ??
              params.assignedStaffUserId ??
              null,
            primaryUserId:
              existingClient.primaryUserId ?? primaryMember?.userId ?? null,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(taxClients.id, existingClient.id))
          .returning()
      : await tx
          .insert(taxClients)
          .values({
            teamId: params.teamId,
            primaryUserId: primaryMember?.userId ?? null,
            clientKind,
            status: "active",
            assignedStaffUserId: params.assignedStaffUserId ?? null,
          })
          .returning();

    if (!client) {
      throw new Error("Failed to create tax client");
    }

    const [existingSubjectLink] = await tx
      .select({ id: taxClientSubjects.id })
      .from(taxClientSubjects)
      .where(eq(taxClientSubjects.clientId, client.id))
      .limit(1);

    if (!existingSubjectLink) {
      const [subject] = await tx
        .insert(taxSubjects)
        .values({
          userId: primaryMember?.userId ?? null,
          subjectType: subjectTypeForClientKind(clientKind),
          displayName: team.name || "Tax subject",
          countryCode: team.countryCode || "NL",
        })
        .returning();

      if (!subject) {
        throw new Error("Failed to create tax subject");
      }

      await tx.insert(taxClientSubjects).values({
        clientId: client.id,
        teamId: params.teamId,
        subjectId: subject.id,
        role: subjectRoleForClientKind(clientKind),
        accessStatus: "active",
      });
    }

    return client;
  });
}

export async function activateTaxServiceForTeam(
  db: Database,
  params: {
    teamId: string;
    productCode: TaxServiceProductCode;
    clientKind?: TaxClientKind;
    staffUserId?: string | null;
  },
) {
  const client = await ensureTaxClientForTeam(db, {
    teamId: params.teamId,
    clientKind: params.clientKind,
    assignedStaffUserId: params.staffUserId,
  });

  return db.transaction(async (tx) => {
    const [product] = await tx
      .select()
      .from(taxServiceProducts)
      .where(
        and(
          eq(taxServiceProducts.code, params.productCode),
          eq(taxServiceProducts.active, true),
        ),
      )
      .limit(1);

    if (!product) {
      throw new Error("Tax service product not found");
    }

    const [existingEntitlement] = await tx
      .select()
      .from(taxEntitlements)
      .where(
        and(
          eq(taxEntitlements.clientId, client.id),
          eq(taxEntitlements.productId, product.id),
          eq(taxEntitlements.source, "manual"),
          isNull(taxEntitlements.sourceRef),
        ),
      )
      .limit(1);

    const [entitlement] = existingEntitlement
      ? await tx
          .update(taxEntitlements)
          .set({
            status: "active",
            endsAt: null,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(taxEntitlements.id, existingEntitlement.id))
          .returning()
      : await tx
          .insert(taxEntitlements)
          .values({
            clientId: client.id,
            teamId: params.teamId,
            productId: product.id,
            source: "manual",
            status: "active",
          })
          .returning();

    if (!entitlement) {
      throw new Error("Failed to activate tax entitlement");
    }

    const [subjectLink] = await tx
      .select({
        subjectId: taxClientSubjects.subjectId,
      })
      .from(taxClientSubjects)
      .where(eq(taxClientSubjects.clientId, client.id))
      .orderBy(
        sql`case ${taxClientSubjects.role} when 'primary' then 0 when 'business_entity' then 1 when 'partner' then 2 else 3 end`,
      )
      .limit(1);

    if (!subjectLink) {
      throw new Error("Tax subject not found");
    }

    const mandateTypes = [
      ...new Set(
        product.requiredMandates
          .map(toTaxMandateType)
          .filter(
            (mandateType): mandateType is TaxMandateType =>
              mandateType !== null,
          ),
      ),
    ];
    const mandates: (typeof taxMandates.$inferSelect)[] = [];
    const tasks: (typeof taxTasks.$inferSelect)[] = [];

    for (const mandateType of mandateTypes) {
      const [existingMandate] = await tx
        .select()
        .from(taxMandates)
        .where(
          and(
            eq(taxMandates.clientId, client.id),
            eq(taxMandates.subjectId, subjectLink.subjectId),
            eq(taxMandates.mandateType, mandateType),
            isNull(taxMandates.taxYear),
          ),
        )
        .limit(1);

      const [mandate] = existingMandate
        ? existingMandate.status === "draft"
          ? await tx
              .update(taxMandates)
              .set({
                status: "requested",
                entitlementId: existingMandate.entitlementId ?? entitlement.id,
                requestedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              })
              .where(eq(taxMandates.id, existingMandate.id))
              .returning()
          : [existingMandate]
        : await tx
            .insert(taxMandates)
            .values({
              clientId: client.id,
              teamId: params.teamId,
              subjectId: subjectLink.subjectId,
              entitlementId: entitlement.id,
              mandateType,
              status: "requested",
            })
            .returning();

      if (!mandate) {
        throw new Error("Failed to request tax mandate");
      }

      mandates.push(mandate);

      if (!mandateNeedsTask(mandate.status)) {
        continue;
      }

      const [existingTask] = await tx
        .select()
        .from(taxTasks)
        .where(
          and(eq(taxTasks.mandateId, mandate.id), eq(taxTasks.status, "open")),
        )
        .limit(1);

      if (existingTask) {
        tasks.push(existingTask);
        continue;
      }

      const [task] = await tx
        .insert(taxTasks)
        .values({
          clientId: client.id,
          teamId: params.teamId,
          subjectId: subjectLink.subjectId,
          mandateId: mandate.id,
          assignedToUserId: client.primaryUserId,
          assignedToStaffUserId:
            params.staffUserId ?? client.assignedStaffUserId,
          title: mandateTaskTitle(mandateType),
          description: mandateTaskDescription(mandateType),
          dueDate: mandateTaskDueDate(),
        })
        .returning();

      if (!task) {
        throw new Error("Failed to create tax task");
      }

      tasks.push(task);
    }

    return {
      client,
      entitlement,
      product,
      mandates,
      tasks,
    };
  });
}

export async function getActiveTaxEntitlementsByTeamIds(
  db: Database,
  teamIds: string[],
) {
  if (!teamIds.length) {
    return [];
  }

  return db
    .select({
      teamId: taxClients.teamId,
      clientId: taxClients.id,
      clientKind: taxClients.clientKind,
      clientStatus: taxClients.status,
      entitlementId: taxEntitlements.id,
      entitlementStatus: taxEntitlements.status,
      productCode: taxServiceProducts.code,
      productName: taxServiceProducts.name,
    })
    .from(taxClients)
    .leftJoin(
      taxEntitlements,
      and(
        eq(taxEntitlements.clientId, taxClients.id),
        eq(taxEntitlements.status, "active"),
      ),
    )
    .leftJoin(
      taxServiceProducts,
      eq(taxServiceProducts.id, taxEntitlements.productId),
    )
    .where(inArray(taxClients.teamId, teamIds));
}

export async function getTaxMandateSummariesByTeamIds(
  db: Database,
  teamIds: string[],
) {
  if (!teamIds.length) {
    return [];
  }

  const [mandateRows, taskRows] = await Promise.all([
    db
      .select({
        teamId: taxMandates.teamId,
        mandateType: taxMandates.mandateType,
        status: taxMandates.status,
      })
      .from(taxMandates)
      .where(inArray(taxMandates.teamId, teamIds)),
    db
      .select({
        teamId: taxTasks.teamId,
        status: taxTasks.status,
      })
      .from(taxTasks)
      .where(inArray(taxTasks.teamId, teamIds)),
  ]);

  const summaries = new Map<
    string,
    {
      total: number;
      active: number;
      actionRequired: number;
      openTasks: number;
      mandateTypes: TaxMandateType[];
      statuses: (typeof taxMandates.$inferSelect.status)[];
    }
  >();

  const getSummary = (teamId: string) => {
    const summary = summaries.get(teamId) ?? {
      total: 0,
      active: 0,
      actionRequired: 0,
      openTasks: 0,
      mandateTypes: [],
      statuses: [],
    };

    summaries.set(teamId, summary);

    return summary;
  };

  for (const row of mandateRows) {
    const summary = getSummary(row.teamId);

    summary.total += 1;

    if (row.status === "active") {
      summary.active += 1;
    }

    if (mandateNeedsTask(row.status)) {
      summary.actionRequired += 1;
    }

    if (!summary.mandateTypes.includes(row.mandateType)) {
      summary.mandateTypes.push(row.mandateType);
    }

    if (!summary.statuses.includes(row.status)) {
      summary.statuses.push(row.status);
    }
  }

  for (const row of taskRows) {
    if (row.status !== "open") {
      continue;
    }

    const summary = getSummary(row.teamId);

    summary.openTasks += 1;
  }

  return [...summaries.entries()].map(([teamId, summary]) => ({
    teamId,
    ...summary,
  }));
}

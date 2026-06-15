import {
  adminProcedure,
  createTRPCRouter,
  isTaxAdminEnabled,
  protectedProcedure,
} from "@api/trpc/init";
import {
  activateTaxServiceForTeam,
  confirmTaxMandateDocumentMatch,
  createTaxDeclarationForTeam,
  ensureTaxClientForTeam,
  getAdminClientTeamById,
  getAdminClientTeams,
  getPlatformStaffByUserId,
  getTaxServiceProducts,
  queueTaxDigipoortMandateActivation,
  queueTaxDigipoortMandateRequest,
  recordTaxAuditEvent,
  updateTaxDeclarationStatusForTeam,
} from "@midday/db/queries";
import { triggerJob } from "@midday/job-client";
import { z } from "zod";

const taxClientKindSchema = z.enum([
  "private_person",
  "household",
  "sole_proprietor",
  "company",
]);

const taxServiceProductCodeSchema = z.enum([
  "vat_return",
  "income_tax_private",
  "income_tax_entrepreneur",
  "via_retrieval",
  "sba_monitoring",
]);
const taxDeclarationTypeSchema = z.enum([
  "income_tax_private",
  "income_tax_entrepreneur",
  "vat_return",
]);
const taxDeclarationStatusSchema = z.enum([
  "draft",
  "collecting",
  "ready_for_review",
  "in_review",
  "approved",
  "queued_for_submission",
  "submitted",
  "accepted",
  "rejected",
  "cancelled",
]);
const optionalDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional();
const createTaxDeclarationInputSchema = z
  .object({
    teamId: z.string().uuid(),
    declarationType: taxDeclarationTypeSchema,
    taxYear: z.number().int().min(2000).max(2100),
    period: z.string().trim().max(64).nullable().optional(),
    periodStart: optionalDateSchema,
    periodEnd: optionalDateSchema,
    deadlineDate: optionalDateSchema,
    clientKind: taxClientKindSchema.optional(),
  })
  .superRefine((input, ctx) => {
    if (Boolean(input.periodStart) !== Boolean(input.periodEnd)) {
      ctx.addIssue({
        code: "custom",
        message: "Period start and end date must be provided together",
        path: ["periodStart"],
      });
    }

    if (
      input.periodStart &&
      input.periodEnd &&
      input.periodStart > input.periodEnd
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Period end date must be after period start date",
        path: ["periodEnd"],
      });
    }

    if (
      input.declarationType === "vat_return" &&
      (!input.periodStart || !input.periodEnd)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "VAT return declarations require a period start and end",
        path: ["periodStart"],
      });
    }
  });

export const adminRouter = createTRPCRouter({
  me: protectedProcedure.query(async ({ ctx: { db, session } }) => {
    return {
      enabled: isTaxAdminEnabled(),
      staff: await getPlatformStaffByUserId(db, session.user.id),
    };
  }),

  clients: adminProcedure
    .input(
      z.object({
        query: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
    )
    .query(async ({ ctx: { db, platformStaff }, input }) => {
      const clients = await getAdminClientTeams(db, input);

      await recordTaxAuditEvent(db, {
        actorStaffUserId: platformStaff.userId,
        action: "admin.clients.list",
        resourceType: "team",
        metadata: {
          query: input.query ?? null,
          limit: input.limit ?? 50,
          resultCount: clients.length,
        },
      });

      return clients;
    }),

  client: adminProcedure
    .input(z.object({ teamId: z.string().uuid() }))
    .query(async ({ ctx: { db, platformStaff }, input }) => {
      const client = await getAdminClientTeamById(db, input.teamId);

      await recordTaxAuditEvent(db, {
        teamId: input.teamId,
        actorStaffUserId: platformStaff.userId,
        action: "admin.client.view",
        resourceType: "team",
        resourceId: input.teamId,
      });

      return client;
    }),

  taxServiceProducts: adminProcedure.query(async ({ ctx: { db } }) => {
    return getTaxServiceProducts(db);
  }),

  activateTaxClient: adminProcedure
    .input(
      z.object({
        teamId: z.string().uuid(),
        clientKind: taxClientKindSchema,
      }),
    )
    .mutation(async ({ ctx: { db, platformStaff }, input }) => {
      const client = await ensureTaxClientForTeam(db, {
        teamId: input.teamId,
        clientKind: input.clientKind,
        assignedStaffUserId: platformStaff.userId,
      });

      await recordTaxAuditEvent(db, {
        teamId: input.teamId,
        actorStaffUserId: platformStaff.userId,
        action: "admin.tax_client.activate",
        resourceType: "tax_client",
        resourceId: client.id,
        metadata: {
          clientKind: input.clientKind,
        },
      });

      return client;
    }),

  activateTaxService: adminProcedure
    .input(
      z.object({
        teamId: z.string().uuid(),
        productCode: taxServiceProductCodeSchema,
        clientKind: taxClientKindSchema.optional(),
      }),
    )
    .mutation(async ({ ctx: { db, platformStaff }, input }) => {
      const result = await activateTaxServiceForTeam(db, {
        teamId: input.teamId,
        productCode: input.productCode,
        clientKind: input.clientKind,
        staffUserId: platformStaff.userId,
      });

      await recordTaxAuditEvent(db, {
        teamId: input.teamId,
        actorStaffUserId: platformStaff.userId,
        action: "admin.tax_service.activate",
        resourceType: "tax_entitlement",
        resourceId: result.entitlement.id,
        metadata: {
          clientId: result.client.id,
          productCode: result.product.code,
          mandateIds: result.mandates.map((mandate) => mandate.id),
          taskIds: result.tasks.map((task) => task.id),
        },
      });

      return result;
    }),

  createTaxDeclaration: adminProcedure
    .input(createTaxDeclarationInputSchema)
    .mutation(async ({ ctx: { db, platformStaff }, input }) => {
      const result = await createTaxDeclarationForTeam(db, {
        teamId: input.teamId,
        declarationType: input.declarationType,
        taxYear: input.taxYear,
        period: input.period,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        deadlineDate: input.deadlineDate,
        clientKind: input.clientKind,
        staffUserId: platformStaff.userId,
      });

      await recordTaxAuditEvent(db, {
        teamId: input.teamId,
        actorStaffUserId: platformStaff.userId,
        action: result.created
          ? "admin.tax_declaration.create"
          : "admin.tax_declaration.reuse_existing",
        resourceType: "tax_declaration",
        resourceId: result.declaration.id,
        metadata: {
          declarationType: input.declarationType,
          taxYear: input.taxYear,
          period: input.period ?? null,
          periodStart: input.periodStart ?? null,
          periodEnd: input.periodEnd ?? null,
          serviceOrderId: result.serviceOrder?.id ?? null,
          taskId: result.task?.id ?? null,
        },
      });

      return result;
    }),

  updateTaxDeclarationStatus: adminProcedure
    .input(
      z.object({
        teamId: z.string().uuid(),
        declarationId: z.string().uuid(),
        status: taxDeclarationStatusSchema,
        providerReference: z.string().trim().max(255).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx: { db, platformStaff }, input }) => {
      const declaration = await updateTaxDeclarationStatusForTeam(db, {
        teamId: input.teamId,
        declarationId: input.declarationId,
        status: input.status,
        providerReference: input.providerReference,
        staffUserId: platformStaff.userId,
      });

      await recordTaxAuditEvent(db, {
        teamId: input.teamId,
        actorStaffUserId: platformStaff.userId,
        action: "admin.tax_declaration.status_update",
        resourceType: "tax_declaration",
        resourceId: input.declarationId,
        metadata: {
          status: input.status,
          providerReference: input.providerReference ?? null,
        },
      });

      return declaration;
    }),

  confirmTaxMandateDocumentMatch: adminProcedure
    .input(
      z.object({
        teamId: z.string().uuid(),
        matchId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx: { db, platformStaff }, input }) => {
      const result = await confirmTaxMandateDocumentMatch(db, {
        teamId: input.teamId,
        matchId: input.matchId,
      });

      await recordTaxAuditEvent(db, {
        teamId: input.teamId,
        actorStaffUserId: platformStaff.userId,
        action: "admin.tax_mandate_document_match.confirm",
        resourceType: "tax_mandate_document_match",
        resourceId: result.documentMatch.id,
        metadata: {
          mandateId: result.mandate.id,
          taskId: result.task?.id ?? null,
        },
      });

      return result;
    }),

  requestTaxMandateViaDigipoort: adminProcedure
    .input(
      z.object({
        teamId: z.string().uuid(),
        mandateId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx: { db, platformStaff }, input }) => {
      const digipoortJob = await queueTaxDigipoortMandateRequest(db, {
        teamId: input.teamId,
        mandateId: input.mandateId,
      });

      const job = await triggerJob(
        "process-tax-digipoort-job",
        {
          teamId: input.teamId,
          jobId: digipoortJob.id,
          operation: digipoortJob.operation,
        },
        "tax",
        {
          jobId: `tax-digipoort_${input.teamId}_${digipoortJob.id}`,
          attempts: 3,
        },
      );

      await recordTaxAuditEvent(db, {
        teamId: input.teamId,
        actorStaffUserId: platformStaff.userId,
        action: "admin.tax_mandate.digipoort_request",
        resourceType: "tax_mandate",
        resourceId: input.mandateId,
        metadata: {
          digipoortJobId: digipoortJob.id,
          workerJobId: job.id,
          operation: digipoortJob.operation,
        },
      });

      return {
        digipoortJob,
        job,
      };
    }),

  activateTaxMandateViaDigipoort: adminProcedure
    .input(
      z.object({
        teamId: z.string().uuid(),
        matchId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx: { db, platformStaff }, input }) => {
      const digipoortJob = await queueTaxDigipoortMandateActivation(db, {
        teamId: input.teamId,
        matchId: input.matchId,
      });

      const job = await triggerJob(
        "process-tax-digipoort-job",
        {
          teamId: input.teamId,
          jobId: digipoortJob.id,
          operation: digipoortJob.operation,
        },
        "tax",
        {
          jobId: `tax-digipoort_${input.teamId}_${digipoortJob.id}`,
          attempts: 3,
        },
      );

      await recordTaxAuditEvent(db, {
        teamId: input.teamId,
        actorStaffUserId: platformStaff.userId,
        action: "admin.tax_mandate.digipoort_activate",
        resourceType: "tax_mandate",
        resourceId: digipoortJob.mandateId ?? input.matchId,
        metadata: {
          matchId: input.matchId,
          digipoortJobId: digipoortJob.id,
          workerJobId: job.id,
          operation: digipoortJob.operation,
        },
      });

      return {
        digipoortJob,
        job,
      };
    }),
});

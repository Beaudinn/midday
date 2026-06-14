import {
  adminProcedure,
  createTRPCRouter,
  isTaxAdminEnabled,
  protectedProcedure,
} from "@api/trpc/init";
import {
  activateTaxServiceForTeam,
  ensureTaxClientForTeam,
  getAdminClientTeamById,
  getAdminClientTeams,
  getPlatformStaffByUserId,
  getTaxServiceProducts,
  recordTaxAuditEvent,
} from "@midday/db/queries";
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
});

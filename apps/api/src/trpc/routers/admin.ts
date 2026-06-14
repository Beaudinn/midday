import {
  adminProcedure,
  createTRPCRouter,
  isTaxAdminEnabled,
  protectedProcedure,
} from "@api/trpc/init";
import {
  getAdminClientTeams,
  getPlatformStaffByUserId,
  recordTaxAuditEvent,
} from "@midday/db/queries";
import { z } from "zod";

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
});

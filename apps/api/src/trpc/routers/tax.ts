import { createTRPCRouter, protectedProcedure } from "@api/trpc/init";
import {
  getTaxClientByTeamId,
  getTaxServiceProducts,
} from "@midday/db/queries";

export const taxRouter = createTRPCRouter({
  current: protectedProcedure.query(async ({ ctx: { db, teamId } }) => {
    if (!teamId) {
      return null;
    }

    return getTaxClientByTeamId(db, teamId);
  }),

  serviceProducts: protectedProcedure.query(async ({ ctx: { db } }) => {
    return getTaxServiceProducts(db);
  }),
});

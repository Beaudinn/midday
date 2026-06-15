import { createTRPCRouter, protectedProcedure } from "@api/trpc/init";
import {
  getTaxClientByTeamId,
  getTaxServiceProducts,
  updateTaxSubjectIdentityForTeam,
} from "@midday/db/queries";
import { z } from "zod";

const optionalSensitiveIdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .optional();

const optionalPublicIdentifierSchema = z
  .string()
  .trim()
  .max(32)
  .nullable()
  .optional();

export const taxRouter = createTRPCRouter({
  current: protectedProcedure.query(async ({ ctx: { db, teamId } }) => {
    if (!teamId) {
      return null;
    }

    return getTaxClientByTeamId(db, teamId);
  }),

  updateSubjectIdentity: protectedProcedure
    .input(
      z.object({
        subjectId: z.string().uuid(),
        displayName: z.string().trim().min(1).max(120).optional(),
        countryCode: z.string().trim().length(2).optional(),
        bsn: optionalSensitiveIdentifierSchema,
        rsin: optionalSensitiveIdentifierSchema,
        kvkNumber: optionalPublicIdentifierSchema,
        vatNumber: optionalPublicIdentifierSchema,
      }),
    )
    .mutation(async ({ ctx: { db, teamId }, input }) => {
      if (!teamId) {
        throw new Error("Team context is required");
      }

      return updateTaxSubjectIdentityForTeam(db, {
        teamId,
        ...input,
      });
    }),

  serviceProducts: protectedProcedure.query(async ({ ctx: { db } }) => {
    return getTaxServiceProducts(db);
  }),
});

import { createTRPCRouter, protectedProcedure } from "@api/trpc/init";
import {
  endTaxPartnerRelationshipForTeam,
  getTaxClientByTeamId,
  getTaxServiceProducts,
  updateTaxSubjectIdentityForTeam,
  upsertTaxPartnerRelationshipForTeam,
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
const optionalDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional();
const taxSubjectRelationshipTypeSchema = z.enum([
  "spouse",
  "registered_partner",
  "cohabiting_partner",
  "former_partner",
  "other",
]);

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

  savePartnerRelationship: protectedProcedure
    .input(
      z.object({
        primarySubjectId: z.string().uuid(),
        relationshipId: z.string().uuid().optional(),
        relatedSubjectId: z.string().uuid().optional(),
        partnerDisplayName: z.string().trim().min(1).max(120),
        partnerCountryCode: z.string().trim().length(2).optional(),
        relationshipType: taxSubjectRelationshipTypeSchema,
        fiscalPartner: z.boolean(),
        validFrom: optionalDateSchema,
        validTo: optionalDateSchema,
      }),
    )
    .mutation(async ({ ctx: { db, teamId }, input }) => {
      if (!teamId) {
        throw new Error("Team context is required");
      }

      return upsertTaxPartnerRelationshipForTeam(db, {
        teamId,
        ...input,
      });
    }),

  endPartnerRelationship: protectedProcedure
    .input(
      z.object({
        relationshipId: z.string().uuid(),
        validTo: optionalDateSchema,
      }),
    )
    .mutation(async ({ ctx: { db, teamId }, input }) => {
      if (!teamId) {
        throw new Error("Team context is required");
      }

      return endTaxPartnerRelationshipForTeam(db, {
        teamId,
        ...input,
      });
    }),

  serviceProducts: protectedProcedure.query(async ({ ctx: { db } }) => {
    return getTaxServiceProducts(db);
  }),
});

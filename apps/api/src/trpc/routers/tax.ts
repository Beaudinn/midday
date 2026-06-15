import { createTRPCRouter, protectedProcedure } from "@api/trpc/init";
import { api as polarApi } from "@api/utils/polar";
import {
  endTaxPartnerRelationshipForTeam,
  getTaxClientByTeamId,
  getTaxDeclarationIntakeForTeam,
  getTaxServiceProducts,
  linkTaxDocumentToIntakeForTeam,
  requestTaxDeclarationOrderForTeam,
  submitTaxIntakeForTeam,
  updateTaxIntakeAnswerStatusForTeam,
  updateTaxSubjectIdentityForTeam,
  upsertTaxIntakeAnswerForTeam,
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
const taxIntakeSubjectScopeSchema = z.enum([
  "primary",
  "partner",
  "joint",
  "household",
]);
const taxIntakeAnswerSourceSchema = z.enum(["client", "partner"]);
const taxDeclarationOrderTypeSchema = z.enum([
  "income_tax_private",
  "income_tax_entrepreneur",
]);

export const taxRouter = createTRPCRouter({
  current: protectedProcedure.query(async ({ ctx: { db, teamId } }) => {
    if (!teamId) {
      return null;
    }

    return getTaxClientByTeamId(db, teamId);
  }),

  requestDeclaration: protectedProcedure
    .input(
      z.object({
        declarationType: taxDeclarationOrderTypeSchema,
        taxYear: z.number().int().min(2000).max(2100),
      }),
    )
    .mutation(async ({ ctx: { db, teamId, session }, input }) => {
      if (!teamId) {
        throw new Error("Team context is required");
      }

      const result = await requestTaxDeclarationOrderForTeam(db, {
        teamId,
        declarationType: input.declarationType,
        taxYear: input.taxYear,
        orderedByUserId: session.user.id,
      });

      if (result.status !== "payment_required") {
        return {
          status: result.status,
          declarationId: result.declarationId,
          serviceOrderId: result.serviceOrderId,
          checkoutUrl: null,
        };
      }

      let checkoutUrl: string | null = null;

      if (result.product.polarProductId) {
        const appUrl =
          process.env.NEXT_PUBLIC_APP_URL ??
          process.env.APP_URL ??
          "http://localhost:3011";
        const checkout = await polarApi.checkouts.create({
          products: [result.product.polarProductId],
          externalCustomerId: teamId,
          customerEmail: session.user.email ?? undefined,
          allowTrial: false,
          successUrl: `${appUrl}/tax?taxOrder=${result.serviceOrderId}`,
          returnUrl: `${appUrl}/tax`,
          metadata: {
            teamId,
            taxServiceOrderId: result.serviceOrderId,
            productCode: result.product.code,
            taxYear: input.taxYear,
          },
        });
        checkoutUrl = checkout.url;
      }

      return {
        status: result.status,
        declarationId: null,
        serviceOrderId: result.serviceOrderId,
        checkoutUrl,
      };
    }),

  getDeclarationIntake: protectedProcedure
    .input(z.object({ declarationId: z.string().uuid() }))
    .query(async ({ ctx: { db, teamId }, input }) => {
      if (!teamId) {
        throw new Error("Team context is required");
      }

      return getTaxDeclarationIntakeForTeam(db, {
        teamId,
        declarationId: input.declarationId,
      });
    }),

  upsertIntakeAnswer: protectedProcedure
    .input(
      z.object({
        intakeId: z.string().uuid(),
        sectionKey: z.string().trim().min(1).max(80),
        questionKey: z.string().trim().min(1).max(120),
        subjectScope: taxIntakeSubjectScopeSchema,
        value: z.unknown(),
        source: taxIntakeAnswerSourceSchema.optional(),
      }),
    )
    .mutation(async ({ ctx: { db, teamId, session }, input }) => {
      if (!teamId) {
        throw new Error("Team context is required");
      }

      return upsertTaxIntakeAnswerForTeam(db, {
        teamId,
        intakeId: input.intakeId,
        sectionKey: input.sectionKey,
        questionKey: input.questionKey,
        subjectScope: input.subjectScope,
        value: input.value,
        source: input.source ?? "client",
        status: "confirmed",
        userId: session.user.id,
      });
    }),

  confirmIntakeSuggestion: protectedProcedure
    .input(z.object({ answerId: z.string().uuid() }))
    .mutation(async ({ ctx: { db, teamId }, input }) => {
      if (!teamId) {
        throw new Error("Team context is required");
      }

      return updateTaxIntakeAnswerStatusForTeam(db, {
        teamId,
        answerId: input.answerId,
        status: "confirmed",
      });
    }),

  rejectIntakeSuggestion: protectedProcedure
    .input(z.object({ answerId: z.string().uuid() }))
    .mutation(async ({ ctx: { db, teamId }, input }) => {
      if (!teamId) {
        throw new Error("Team context is required");
      }

      return updateTaxIntakeAnswerStatusForTeam(db, {
        teamId,
        answerId: input.answerId,
        status: "rejected",
      });
    }),

  linkDocumentToIntake: protectedProcedure
    .input(
      z.object({
        intakeId: z.string().uuid(),
        documentId: z.string().uuid(),
        sectionKey: z.string().trim().min(1).max(80),
        subjectScope: taxIntakeSubjectScopeSchema.optional(),
        documentType: z.string().trim().max(120).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx: { db, teamId }, input }) => {
      if (!teamId) {
        throw new Error("Team context is required");
      }

      return linkTaxDocumentToIntakeForTeam(db, {
        teamId,
        intakeId: input.intakeId,
        documentId: input.documentId,
        sectionKey: input.sectionKey,
        subjectScope: input.subjectScope,
        documentType: input.documentType,
      });
    }),

  submitIntake: protectedProcedure
    .input(z.object({ intakeId: z.string().uuid() }))
    .mutation(async ({ ctx: { db, teamId }, input }) => {
      if (!teamId) {
        throw new Error("Team context is required");
      }

      return submitTaxIntakeForTeam(db, {
        teamId,
        intakeId: input.intakeId,
      });
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

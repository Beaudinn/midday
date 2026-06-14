import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "../client";
import {
  taxClientSubjects,
  taxClients,
  taxEntitlements,
  taxServiceProducts,
  taxSubjects,
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

  const [subjects, entitlements] = await Promise.all([
    db
      .select({
        id: taxSubjects.id,
        displayName: taxSubjects.displayName,
        subjectType: taxSubjects.subjectType,
        countryCode: taxSubjects.countryCode,
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
  ]);

  return {
    ...client,
    subjects,
    entitlements,
  };
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

    return {
      client,
      entitlement,
      product,
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

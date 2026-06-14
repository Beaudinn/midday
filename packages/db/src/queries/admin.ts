import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { Database } from "../client";
import { platformStaff, taxAuditEvents, teams, usersOnTeam } from "../schema";
import {
  getActiveTaxEntitlementsByTeamIds,
  getTaxMandateSummariesByTeamIds,
} from "./tax";

export type PlatformStaff = typeof platformStaff.$inferSelect;

export async function getPlatformStaffByUserId(db: Database, userId: string) {
  const [result] = await db
    .select({
      userId: platformStaff.userId,
      role: platformStaff.role,
      active: platformStaff.active,
      createdAt: platformStaff.createdAt,
      updatedAt: platformStaff.updatedAt,
    })
    .from(platformStaff)
    .where(
      and(eq(platformStaff.userId, userId), eq(platformStaff.active, true)),
    )
    .limit(1);

  return result ?? null;
}

export async function getAdminClientTeams(
  db: Database,
  params?: {
    query?: string | null;
    limit?: number;
  },
) {
  const searchTerm = params?.query?.trim();
  const filters = searchTerm
    ? or(
        ilike(teams.name, `%${searchTerm}%`),
        ilike(teams.email, `%${searchTerm}%`),
      )
    : undefined;

  const query = db
    .select({
      id: teams.id,
      name: teams.name,
      email: teams.email,
      createdAt: teams.createdAt,
      plan: teams.plan,
      subscriptionStatus: teams.subscriptionStatus,
      countryCode: teams.countryCode,
      baseCurrency: teams.baseCurrency,
      workspaceType: teams.workspaceType,
      companyType: teams.companyType,
      memberCount: sql<number>`cast(count(${usersOnTeam.userId}) as int)`,
    })
    .from(teams)
    .leftJoin(usersOnTeam, eq(usersOnTeam.teamId, teams.id))
    .$dynamic();

  if (filters) {
    query.where(filters);
  }

  const rows = await query
    .groupBy(
      teams.id,
      teams.name,
      teams.email,
      teams.createdAt,
      teams.plan,
      teams.subscriptionStatus,
      teams.countryCode,
      teams.baseCurrency,
      teams.workspaceType,
      teams.companyType,
    )
    .orderBy(desc(teams.createdAt))
    .limit(params?.limit ?? 50);

  const teamIds = rows.map((row) => row.id);
  const [taxRows, mandateSummaries] = await Promise.all([
    getActiveTaxEntitlementsByTeamIds(db, teamIds),
    getTaxMandateSummariesByTeamIds(db, teamIds),
  ]);

  const taxByTeamId = new Map<
    string,
    {
      id: string;
      kind: string;
      status: string;
      activeProductCodes: string[];
      activeProductNames: string[];
    }
  >();

  for (const row of taxRows) {
    const entry = taxByTeamId.get(row.teamId) ?? {
      id: row.clientId,
      kind: row.clientKind,
      status: row.clientStatus,
      activeProductCodes: [],
      activeProductNames: [],
    };

    if (
      row.productCode &&
      !entry.activeProductCodes.includes(row.productCode)
    ) {
      entry.activeProductCodes.push(row.productCode);
    }

    if (
      row.productName &&
      !entry.activeProductNames.includes(row.productName)
    ) {
      entry.activeProductNames.push(row.productName);
    }

    taxByTeamId.set(row.teamId, entry);
  }

  const mandateSummaryByTeamId = new Map(
    mandateSummaries.map((summary) => [summary.teamId, summary]),
  );

  return rows.map((row) => {
    const taxClient = taxByTeamId.get(row.id);

    return {
      ...row,
      taxClient: taxClient
        ? {
            ...taxClient,
            mandates: mandateSummaryByTeamId.get(row.id) ?? {
              total: 0,
              active: 0,
              actionRequired: 0,
              openTasks: 0,
              mandateTypes: [],
              statuses: [],
            },
          }
        : null,
    };
  });
}

export async function recordTaxAuditEvent(
  db: Database,
  values: typeof taxAuditEvents.$inferInsert,
) {
  const [result] = await db.insert(taxAuditEvents).values(values).returning({
    id: taxAuditEvents.id,
  });

  return result;
}

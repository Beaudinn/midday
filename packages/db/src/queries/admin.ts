import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { Database } from "../client";
import { platformStaff, taxAuditEvents, teams, usersOnTeam } from "../schema";

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

  return query
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

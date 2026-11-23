import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { cache } from "react";
import { DEFAULT_RULES, type DistributionRules } from "@/domain/scheduling/types";
import { db } from "../db/client";
import { functions, organizations, orgSettings, songCategories } from "../db/schema";

export const getOrganization = cache(async (orgId: string) => {
  return db.select().from(organizations).where(eq(organizations.id, orgId)).get();
});

export const getFunctions = cache(async (orgId: string, includeInactive = false) => {
  const rows = await db
    .select()
    .from(functions)
    .where(includeInactive ? eq(functions.organizationId, orgId) : and(eq(functions.organizationId, orgId), eq(functions.active, true)))
    .orderBy(asc(functions.sortOrder), asc(functions.name));
  return rows;
});

export async function functionNameMap(orgId: string): Promise<Record<string, string>> {
  const rows = await getFunctions(orgId, true);
  return Object.fromEntries(rows.map((f) => [f.id, f.name]));
}

export const getSettings = cache(async (orgId: string) => {
  const row = await db.select().from(orgSettings).where(eq(orgSettings.organizationId, orgId)).get();
  if (row) return row;
  await db.insert(orgSettings).values({ organizationId: orgId }).onConflictDoNothing();
  return (await db.select().from(orgSettings).where(eq(orgSettings.organizationId, orgId)).get())!;
});

export async function getRules(orgId: string): Promise<DistributionRules> {
  const s = await getSettings(orgId);
  return {
    ...DEFAULT_RULES,
    avoidConsecutive: s.avoidConsecutive,
    defaultMonthlyLimit: s.defaultMonthlyLimit,
    limitMode: s.limitMode,
    minIntervalDays: s.minIntervalDays,
    prioritizeLess: s.prioritizeLess,
  };
}

export const getCategories = cache(async (orgId: string) => {
  return db.select().from(songCategories).where(eq(songCategories.organizationId, orgId)).orderBy(asc(songCategories.sortOrder), asc(songCategories.name));
});

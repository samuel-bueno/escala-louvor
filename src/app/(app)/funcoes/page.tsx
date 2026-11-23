import type { Metadata } from "next";
import { eq, sql } from "drizzle-orm";
import { PageHeader } from "@/components/ui/primitives";
import { FunctionsManager } from "@/features/settings/functions-manager";
import { requireAdminPage } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { functions, participantFunctions } from "@/server/db/schema";

export const metadata: Metadata = { title: "Funções e instrumentos" };

export default async function FunctionsPage() {
  const user = await requireAdminPage();
  const rows = await db
    .select({ id: functions.id, name: functions.name, kind: functions.kind, active: functions.active, people: sql<number>`(select count(*) from ${participantFunctions} pf where pf.function_id = "functions"."id")` })
    .from(functions)
    .where(eq(functions.organizationId, user.organizationId))
    .orderBy(functions.sortOrder, functions.name);
  return (
    <>
      <PageHeader title="Funções e instrumentos" subtitle="Ministração, vozes, instrumentos e equipe técnica. A ordem aqui é a ordem nas escalas." />
      <FunctionsManager functions={rows.map((r) => ({ ...r, people: Number(r.people) }))} />
    </>
  );
}

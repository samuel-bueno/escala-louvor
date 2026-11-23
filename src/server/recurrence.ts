import "server-only";
import { and, eq, inArray, or } from "drizzle-orm";
import { todayIn } from "@/domain/dates";
import { occurrences } from "@/domain/recurrence";
import { db } from "./db/client";
import { eventSlots, events, functions, orgSettings, recurrenceRules, type EventType } from "./db/schema";

/** Até quando a série padrão de domingos é mantida programada. */
export const SERIES_UNTIL = "2027-12-31";

const CULTO_FAMILY: EventType[] = ["culto", "culto_especial"];

type Rule = typeof recurrenceRules.$inferSelect;

/**
 * Materializa as ocorrências de uma regra entre `from` e `to`.
 *
 * Idempotente e sem duplicação:
 *  - pula datas que já têm ocorrência desta série (inclusive canceladas = exceções);
 *  - pula datas que já têm um compromisso do mesmo tipo (ex.: um culto criado à mão no domingo);
 *  - o índice único (organização, série, data) impede duplicação mesmo em concorrência.
 * Tudo em lote (2–3 comandos), rápido mesmo em banco remoto.
 *
 * @returns ids das ocorrências criadas, em ordem de data
 */
export async function materializeRule(orgId: string, rule: Rule, from: string, to: string, slotTemplate?: string[]): Promise<{ id: string; date: string }[]> {
  const dates = occurrences({ weekday: rule.weekday, nthOfMonth: rule.nthOfMonth }, from, to);
  if (!dates.length) return [];
  const family = CULTO_FAMILY.includes(rule.type) ? CULTO_FAMILY : [rule.type];
  const existing = await db
    .select({ date: events.date })
    .from(events)
    .where(and(eq(events.organizationId, orgId), inArray(events.date, dates), or(eq(events.recurrenceId, rule.id), inArray(events.type, family))));
  const taken = new Set(existing.map((e) => e.date));
  const toCreate = dates.filter((d) => !taken.has(d));
  if (!toCreate.length) return [];

  let template = slotTemplate;
  if (!template) {
    template = [];
    if (CULTO_FAMILY.includes(rule.type)) {
      const settings = await db.select().from(orgSettings).where(eq(orgSettings.organizationId, orgId)).get();
      const valid = new Set((await db.select({ id: functions.id }).from(functions).where(eq(functions.organizationId, orgId))).map((f) => f.id));
      template = (settings?.defaultPositions ?? []).filter((p) => valid.has(p.functionId)).flatMap((p) => Array.from({ length: p.count }, () => p.functionId));
    }
  }

  const created = await db
    .insert(events)
    .values(toCreate.map((date) => ({ organizationId: orgId, title: rule.title, type: rule.type, date, startTime: rule.startTime, endTime: rule.endTime, location: rule.location, recurrenceId: rule.id })))
    .onConflictDoNothing()
    .returning({ id: events.id, date: events.date });

  if (template.length && created.length) {
    const rows = created.flatMap((ev) => template!.map((functionId, i) => ({ eventId: ev.id, functionId, sortOrder: i })));
    // Lotes para não estourar o limite de parâmetros do SQLite.
    for (let i = 0; i < rows.length; i += 500) await db.insert(eventSlots).values(rows.slice(i, i + 500));
  }
  return created.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Garante que todos os domingos, de hoje até SERIES_UNTIL, estejam programados
 * como "Culto de Domingo". Barato quando já está em dia (uma leitura).
 */
export async function ensureSundaySeries(orgId: string): Promise<void> {
  const settings = await db.select({ until: orgSettings.sundaySeriesUntil }).from(orgSettings).where(eq(orgSettings.organizationId, orgId)).get();
  if (settings?.until && settings.until >= SERIES_UNTIL) return;

  let rule = await db
    .select()
    .from(recurrenceRules)
    .where(and(eq(recurrenceRules.organizationId, orgId), eq(recurrenceRules.weekday, 0), eq(recurrenceRules.type, "culto")))
    .get();
  if (!rule) {
    [rule] = await db
      .insert(recurrenceRules)
      .values({ organizationId: orgId, title: "Culto de Domingo", type: "culto", weekday: 0, nthOfMonth: null, startTime: "19:00", endTime: "21:00" })
      .returning();
  }
  if (rule.active) await materializeRule(orgId, rule, todayIn(), SERIES_UNTIL);
  await db.insert(orgSettings).values({ organizationId: orgId, sundaySeriesUntil: SERIES_UNTIL }).onConflictDoUpdate({ target: orgSettings.organizationId, set: { sundaySeriesUntil: SERIES_UNTIL } });
}

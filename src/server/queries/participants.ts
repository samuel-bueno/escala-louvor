import "server-only";
import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { endOfMonth, startOfMonth } from "@/domain/dates";
import type { SchedParticipant } from "@/domain/scheduling/types";
import { db } from "../db/client";
import { eventSlots, events, functions, participantFunctions, participants, unavailability, users } from "../db/schema";

export type ParticipantFunctionRef = { functionId: string; name: string; kind: string; isPrimary: boolean };

async function functionsByParticipant(ids: string[]) {
  const map = new Map<string, ParticipantFunctionRef[]>();
  if (ids.length === 0) return map;
  const rows = await db
    .select({ participantId: participantFunctions.participantId, functionId: functions.id, name: functions.name, kind: functions.kind, isPrimary: participantFunctions.isPrimary, sort: functions.sortOrder })
    .from(participantFunctions)
    .innerJoin(functions, eq(functions.id, participantFunctions.functionId))
    .where(inArray(participantFunctions.participantId, ids))
    .orderBy(desc(participantFunctions.isPrimary), asc(functions.sortOrder));
  for (const r of rows) {
    const list = map.get(r.participantId) ?? [];
    list.push({ functionId: r.functionId, name: r.name, kind: r.kind, isPrimary: r.isPrimary });
    map.set(r.participantId, list);
  }
  return map;
}

/** Lista com estatísticas derivadas (nada redundante salvo no banco). */
export async function listParticipants(orgId: string, today: string, opts: { includeInactive?: boolean } = {}) {
  const rows = await db
    .select()
    .from(participants)
    .where(opts.includeInactive ? eq(participants.organizationId, orgId) : and(eq(participants.organizationId, orgId), eq(participants.active, true)))
    .orderBy(desc(participants.active), asc(participants.displayName));
  const ids = rows.map((r) => r.id);
  const fns = await functionsByParticipant(ids);

  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const stats = ids.length
    ? await db
        .select({
          participantId: eventSlots.participantId,
          lastDate: sql<string | null>`max(case when "events"."date" <= ${today} then "events"."date" end)`,
          monthCount: sql<number>`count(distinct case when "events"."date" between ${monthStart} and ${monthEnd} then "events"."id" end)`,
          nextDate: sql<string | null>`min(case when "events"."date" >= ${today} then "events"."date" end)`,
        })
        .from(eventSlots)
        .innerJoin(events, eq(events.id, eventSlots.eventId))
        .where(and(inArray(eventSlots.participantId, ids), ne(events.status, "cancelled")))
        .groupBy(eventSlots.participantId)
    : [];
  const statMap = new Map(stats.map((s) => [s.participantId, s]));
  const unav = ids.length
    ? await db
        .select({ participantId: unavailability.participantId })
        .from(unavailability)
        .where(and(inArray(unavailability.participantId, ids), lte(unavailability.startDate, today), gte(unavailability.endDate, today)))
    : [];
  const unavToday = new Set(unav.map((u) => u.participantId));

  return rows.map((p) => ({
    ...p,
    functions: fns.get(p.id) ?? [],
    lastDate: statMap.get(p.id)?.lastDate ?? null,
    nextDate: statMap.get(p.id)?.nextDate ?? null,
    monthCount: Number(statMap.get(p.id)?.monthCount ?? 0),
    unavailableToday: unavToday.has(p.id),
  }));
}
export type ParticipantListItem = Awaited<ReturnType<typeof listParticipants>>[number];

export async function getParticipant(orgId: string, id: string) {
  const p = await db
    .select()
    .from(participants)
    .where(and(eq(participants.id, id), eq(participants.organizationId, orgId)))
    .get();
  if (!p) return null;
  const [fns, unav, account] = await Promise.all([
    functionsByParticipant([id]),
    db.select().from(unavailability).where(eq(unavailability.participantId, id)).orderBy(asc(unavailability.startDate)),
    db.select({ id: users.id, email: users.email, role: users.role, leadsInstrumental: users.leadsInstrumental, leadsVocal: users.leadsVocal, active: users.active }).from(users).where(eq(users.participantId, id)).get(),
  ]);
  return { ...p, functions: fns.get(id) ?? [], unavailability: unav, account: account ?? null };
}

/** Escalas de uma pessoa (próximas ou passadas). */
export async function getParticipantSchedule(orgId: string, participantId: string, from: string, direction: "next" | "past", limit = 20) {
  return db
    .select({
      slotId: eventSlots.id,
      status: eventSlots.status,
      functionName: functions.name,
      eventId: events.id,
      title: events.title,
      type: events.type,
      date: events.date,
      startTime: events.startTime,
      eventStatus: events.status,
      location: events.location,
      confirmDeadline: events.confirmDeadline,
    })
    .from(eventSlots)
    .innerJoin(events, eq(events.id, eventSlots.eventId))
    .innerJoin(functions, eq(functions.id, eventSlots.functionId))
    .where(
      and(
        eq(events.organizationId, orgId),
        eq(eventSlots.participantId, participantId),
        direction === "next" ? gte(events.date, from) : sql`${events.date} < ${from}`,
      ),
    )
    .orderBy(direction === "next" ? asc(events.date) : desc(events.date), asc(events.startTime))
    .limit(limit);
}

/** Participantes no formato do motor de geração. */
export async function loadSchedParticipants(orgId: string, from: string, to: string): Promise<SchedParticipant[]> {
  const rows = await db.select().from(participants).where(eq(participants.organizationId, orgId));
  const ids = rows.map((r) => r.id);
  const [fns, unav] = await Promise.all([
    functionsByParticipant(ids),
    ids.length
      ? db
          .select()
          .from(unavailability)
          .where(and(eq(unavailability.organizationId, orgId), lte(unavailability.startDate, to), gte(unavailability.endDate, from)))
      : Promise.resolve([]),
  ]);
  return rows.map((p) => {
    const f = fns.get(p.id) ?? [];
    return {
      id: p.id,
      name: p.displayName,
      active: p.active,
      functionIds: f.map((x) => x.functionId),
      primaryFunctionId: f.find((x) => x.isPrimary)?.functionId ?? null,
      monthlyLimit: p.monthlyLimit,
      usualDays: p.usualDays,
      unavailable: unav.filter((u) => u.participantId === p.id).map((u) => ({ start: u.startDate, end: u.endDate })),
    };
  });
}

import "server-only";
import { and, asc, eq, gte, inArray, lte, ne, notInArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { addDays } from "@/domain/dates";
import type { Assignment } from "@/domain/scheduling/types";
import { db } from "../db/client";
import { eventSlots, events, functions, participants, setlistItems, songCategories, songResources, songs } from "../db/schema";

export async function listEvents(orgId: string, from: string, to: string, opts: { includeCancelled?: boolean; types?: string[] } = {}) {
  const rows = await db
    .select({
      id: events.id,
      title: events.title,
      type: events.type,
      date: events.date,
      startTime: events.startTime,
      endTime: events.endTime,
      location: events.location,
      theme: events.theme,
      status: events.status,
      confirmDeadline: events.confirmDeadline,
      setlistUpdatedAt: events.setlistUpdatedAt,
      setlistUpdatedBy: events.setlistUpdatedBy,
      slotsTotal: sql<number>`(select count(*) from ${eventSlots} s where s.event_id = "events"."id")`,
      slotsFilled: sql<number>`(select count(*) from ${eventSlots} s where s.event_id = "events"."id" and (s.participant_id is not null or s.guest_name is not null))`,
      confirmed: sql<number>`(select count(*) from ${eventSlots} s where s.event_id = "events"."id" and (s.participant_id is not null or s.guest_name is not null) and s.status = 'confirmed')`,
      declined: sql<number>`(select count(*) from ${eventSlots} s where s.event_id = "events"."id" and (s.participant_id is not null or s.guest_name is not null) and s.status = 'declined')`,
      songsCount: sql<number>`(select count(*) from ${setlistItems} i where i.event_id = "events"."id")`,
      minister: sql<string | null>`(select coalesce(p.display_name, s.guest_name) from ${eventSlots} s join ${functions} f on f.id = s.function_id left join ${participants} p on p.id = s.participant_id where s.event_id = "events"."id" and f.kind = 'minister' and (s.participant_id is not null or s.guest_name is not null) order by s.sort_order limit 1)`,
    })
    .from(events)
    .where(
      and(
        eq(events.organizationId, orgId),
        gte(events.date, from),
        lte(events.date, to),
        opts.includeCancelled ? undefined : ne(events.status, "cancelled"),
        opts.types?.length ? inArray(events.type, opts.types as never[]) : undefined,
      ),
    )
    .orderBy(asc(events.date), asc(events.startTime));
  return rows.map((r) => ({
    ...r,
    slotsTotal: Number(r.slotsTotal),
    slotsFilled: Number(r.slotsFilled),
    confirmed: Number(r.confirmed),
    declined: Number(r.declined),
    songsCount: Number(r.songsCount),
  }));
}
export type EventListItem = Awaited<ReturnType<typeof listEvents>>[number];

export async function getEvent(orgId: string, id: string) {
  return db
    .select()
    .from(events)
    .where(and(eq(events.id, id), eq(events.organizationId, orgId)))
    .get();
}

export async function getEventSlots(eventId: string) {
  const sug = alias(participants, "sug");
  return db
    .select({
      id: eventSlots.id,
      functionId: eventSlots.functionId,
      functionName: functions.name,
      functionKind: functions.kind,
      sortOrder: eventSlots.sortOrder,
      required: eventSlots.required,
      participantId: eventSlots.participantId,
      participantName: participants.displayName,
      participantPhoto: participants.photoUrl,
      guestName: eventSlots.guestName,
      locked: eventSlots.locked,
      assignedBy: eventSlots.assignedBy,
      status: eventSlots.status,
      declineReason: eventSlots.declineReason,
      swapSuggestedId: eventSlots.swapSuggestedParticipantId,
      swapSuggestedName: sug.displayName,
      notes: eventSlots.notes,
      respondedAt: eventSlots.respondedAt,
    })
    .from(eventSlots)
    .innerJoin(functions, eq(functions.id, eventSlots.functionId))
    .leftJoin(participants, eq(participants.id, eventSlots.participantId))
    .leftJoin(sug, eq(sug.id, eventSlots.swapSuggestedParticipantId))
    .where(eq(eventSlots.eventId, eventId))
    .orderBy(asc(eventSlots.sortOrder), asc(functions.sortOrder));
}
export type SlotRow = Awaited<ReturnType<typeof getEventSlots>>[number];

export async function getSetlist(eventId: string) {
  const items = await db
    .select({
      id: setlistItems.id,
      songId: songs.id,
      position: setlistItems.position,
      key: setlistItems.key,
      notes: setlistItems.notes,
      title: songs.title,
      artist: songs.artist,
      originalKey: songs.originalKey,
      url: songs.url,
      durationSec: songs.durationSec,
      bpm: songs.bpm,
      categoryId: songs.categoryId,
      categoryName: songCategories.name,
      active: songs.active,
    })
    .from(setlistItems)
    .innerJoin(songs, eq(songs.id, setlistItems.songId))
    .leftJoin(songCategories, eq(songCategories.id, songs.categoryId))
    .where(eq(setlistItems.eventId, eventId))
    .orderBy(asc(setlistItems.position));
  const ids = items.map((i) => i.songId);
  const links = ids.length ? await db.select().from(songResources).where(inArray(songResources.songId, ids)) : [];
  return items.map((i) => ({ ...i, links: links.filter((l) => l.songId === i.songId) }));
}
export type SetlistRow = Awaited<ReturnType<typeof getSetlist>>[number];

/** Participações (não canceladas) em uma janela — base de conflitos e equilíbrio. */
export async function loadAssignments(orgId: string, from: string, to: string, excludeEventIds: string[] = []): Promise<Assignment[]> {
  const rows = await db
    .select({
      eventId: events.id,
      eventTitle: events.title,
      participantId: eventSlots.participantId,
      functionId: eventSlots.functionId,
      date: events.date,
      startTime: events.startTime,
      endTime: events.endTime,
    })
    .from(eventSlots)
    .innerJoin(events, eq(events.id, eventSlots.eventId))
    .where(
      and(
        eq(events.organizationId, orgId),
        ne(events.status, "cancelled"),
        gte(events.date, from),
        lte(events.date, to),
        sql`${eventSlots.participantId} is not null`,
        excludeEventIds.length ? notInArray(events.id, excludeEventIds) : undefined,
      ),
    );
  return rows.map((r) => ({ ...r, participantId: r.participantId! }));
}

/** Janela de histórico usada pelos algoritmos: 60 dias antes / 60 depois. */
export function historyWindow(from: string, to: string) {
  return { from: addDays(from, -60), to: addDays(to, 60) };
}

/** Posições de vários eventos de uma vez (painéis de liderança). */
export async function listSlotsForEvents(eventIds: string[]) {
  if (!eventIds.length) return [];
  return db
    .select({
      eventId: eventSlots.eventId,
      functionName: functions.name,
      kind: functions.kind,
      participantId: eventSlots.participantId,
      guestName: eventSlots.guestName,
      status: eventSlots.status,
      required: eventSlots.required,
    })
    .from(eventSlots)
    .innerJoin(functions, eq(functions.id, eventSlots.functionId))
    .where(inArray(eventSlots.eventId, eventIds))
    .orderBy(asc(eventSlots.sortOrder));
}

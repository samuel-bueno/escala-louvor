import "server-only";
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import type { SetlistSong } from "@/domain/setlist/generate";
import { db } from "../db/client";
import { events, setlistItems, songCategories, songPlays, songResources, songs } from "../db/schema";

export async function listSongs(orgId: string, opts: { includeInactive?: boolean } = {}) {
  const rows = await db
    .select({
      id: songs.id,
      title: songs.title,
      artist: songs.artist,
      originalKey: songs.originalKey,
      bpm: songs.bpm,
      durationSec: songs.durationSec,
      url: songs.url,
      categoryId: songs.categoryId,
      categoryName: songCategories.name,
      theme: songs.theme,
      tags: songs.tags,
      difficulty: songs.difficulty,
      active: songs.active,
      lastPlayed: sql<string | null>`(select max(p.date) from ${songPlays} p where p.song_id = "songs"."id")`,
      playCount: sql<number>`(select count(*) from ${songPlays} p where p.song_id = "songs"."id")`,
    })
    .from(songs)
    .leftJoin(songCategories, eq(songCategories.id, songs.categoryId))
    .where(opts.includeInactive ? eq(songs.organizationId, orgId) : and(eq(songs.organizationId, orgId), eq(songs.active, true)))
    .orderBy(asc(songs.title));
  return rows.map((r) => ({ ...r, playCount: Number(r.playCount) }));
}
export type SongListItem = Awaited<ReturnType<typeof listSongs>>[number];

export async function getSong(orgId: string, id: string) {
  const song = await db
    .select()
    .from(songs)
    .where(and(eq(songs.id, id), eq(songs.organizationId, orgId)))
    .get();
  if (!song) return null;
  const [links, plays] = await Promise.all([
    db.select().from(songResources).where(eq(songResources.songId, id)),
    db
      .select({ date: songPlays.date, key: songPlays.key, eventId: songPlays.eventId, title: events.title })
      .from(songPlays)
      .leftJoin(events, eq(events.id, songPlays.eventId))
      .where(eq(songPlays.songId, id))
      .orderBy(desc(songPlays.date))
      .limit(20),
  ]);
  return { ...song, links, plays };
}

/**
 * Músicas no formato do gerador. "plays" = histórico real + repertórios já
 * agendados em outros eventos (evita repetir a mesma música em sequência).
 */
export async function loadSetlistSongs(orgId: string, excludeEventId?: string): Promise<SetlistSong[]> {
  const [rows, played, scheduled] = await Promise.all([
    db.select().from(songs).where(eq(songs.organizationId, orgId)),
    db.select({ songId: songPlays.songId, date: songPlays.date }).from(songPlays).where(eq(songPlays.organizationId, orgId)),
    db
      .select({ songId: setlistItems.songId, date: events.date })
      .from(setlistItems)
      .innerJoin(events, eq(events.id, setlistItems.eventId))
      .where(
        and(
          eq(events.organizationId, orgId),
          ne(events.status, "cancelled"),
          ne(events.status, "completed"),
          excludeEventId ? ne(events.id, excludeEventId) : undefined,
        ),
      ),
  ]);
  const plays = new Map<string, string[]>();
  for (const p of [...played, ...scheduled]) {
    const list = plays.get(p.songId) ?? [];
    if (!list.includes(p.date)) list.push(p.date);
    plays.set(p.songId, list);
  }
  return rows.map((s) => ({
    id: s.id,
    title: s.title,
    active: s.active,
    categoryId: s.categoryId,
    theme: s.theme,
    tags: s.tags,
    difficulty: s.difficulty,
    durationSec: s.durationSec,
    plays: plays.get(s.id) ?? [],
  }));
}

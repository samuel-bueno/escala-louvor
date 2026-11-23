import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/layout/back-link";
import { PageHeader } from "@/components/ui/primitives";
import { formatDate, weekdayName } from "@/domain/dates";
import { SetlistEditor } from "@/features/setlist/setlist-editor";
import { requireSetlistPage } from "@/server/auth/session";
import { getCategories, getSettings } from "@/server/queries/core";
import { getEvent, getSetlist } from "@/server/queries/events";
import { listSongs } from "@/server/queries/songs";

export const metadata: Metadata = { title: "Repertório" };

export default async function SetlistPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireSetlistPage();
  const { id } = await params;
  const ev = await getEvent(user.organizationId, id);
  if (!ev) notFound();
  const [setlist, songs, categories, settings] = await Promise.all([getSetlist(id), listSongs(user.organizationId, { includeInactive: true }), getCategories(user.organizationId), getSettings(user.organizationId)]);
  const version = setlist.map((s) => `${s.songId}:${s.key}:${s.notes}`).join("|");
  return (
    <>
      <PageHeader back={<BackLink href={`/eventos/${id}`} label={ev.title} />} title="Repertório" subtitle={`${ev.title} · ${weekdayName(ev.date)}, ${formatDate(ev.date)}${ev.theme ? ` · Tema: ${ev.theme}` : ""}`} />
      <SetlistEditor
        key={version}
        eventId={id}
        readOnly={ev.status === "cancelled"}
        initial={setlist.map((s) => ({ songId: s.songId, key: s.key, notes: s.notes }))}
        library={songs.map((s) => ({ id: s.id, title: s.title, artist: s.artist, categoryId: s.categoryId, categoryName: s.categoryName, originalKey: s.originalKey, durationSec: s.durationSec, url: s.url, active: s.active, lastPlayed: s.lastPlayed }))}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        defaults={{ count: settings.defaultSongCount, minInterval: settings.songMinIntervalDays }}
      />
    </>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/layout/back-link";
import { PageHeader } from "@/components/ui/primitives";
import { SongForm } from "@/features/songs/song-form";
import { requireSetlistPage } from "@/server/auth/session";
import { getCategories } from "@/server/queries/core";
import { getSong } from "@/server/queries/songs";

export const metadata: Metadata = { title: "Editar música" };

export default async function EditSongPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireSetlistPage();
  const { id } = await params;
  const [song, categories] = await Promise.all([getSong(user.organizationId, id), getCategories(user.organizationId)]);
  if (!song) notFound();
  return (
    <>
      <PageHeader back={<BackLink href={`/musicas/${id}`} label={song.title} />} title="Editar música" />
      <SongForm categories={categories} initial={{ ...song, extraLinks: song.links.map((l) => (l.label ? `${l.label} | ${l.url}` : l.url)).join("\n") }} />
    </>
  );
}

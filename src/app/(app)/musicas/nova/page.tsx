import type { Metadata } from "next";
import { BackLink } from "@/components/layout/back-link";
import { PageHeader } from "@/components/ui/primitives";
import { SongForm } from "@/features/songs/song-form";
import { requireSetlistPage } from "@/server/auth/session";
import { getCategories } from "@/server/queries/core";

export const metadata: Metadata = { title: "Nova música" };

export default async function NewSongPage() {
  const user = await requireSetlistPage();
  const categories = await getCategories(user.organizationId);
  return (
    <>
      <PageHeader back={<BackLink href="/musicas" label="Músicas" />} title="Nova música" subtitle="Só o título é obrigatório." />
      <SongForm categories={categories} initial={{ title: "", artist: null, originalKey: null, bpm: null, durationSec: null, url: null, categoryId: null, theme: null, tags: [], difficulty: null, active: true, notes: null, extraLinks: "" }} />
    </>
  );
}

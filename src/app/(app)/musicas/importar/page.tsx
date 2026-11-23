import type { Metadata } from "next";
import { BackLink } from "@/components/layout/back-link";
import { PageHeader } from "@/components/ui/primitives";
import { SongImport } from "@/features/songs/song-import";
import { requireSetlistPage } from "@/server/auth/session";
import { getCategories } from "@/server/queries/core";
import { listSongs } from "@/server/queries/songs";

export const metadata: Metadata = { title: "Importar músicas" };

export default async function ImportSongsPage() {
  const user = await requireSetlistPage();
  const [songs, categories] = await Promise.all([listSongs(user.organizationId, { includeInactive: true }), getCategories(user.organizationId)]);
  return (
    <>
      <PageHeader back={<BackLink href="/musicas" label="Músicas" />} title="Importar lista de músicas" subtitle="Cole nomes e links. Você revisa, corrige e remove linhas antes de salvar." />
      <SongImport existingTitles={songs.map((s) => s.title)} existingUrls={songs.map((s) => s.url ?? "")} categories={categories} />
    </>
  );
}

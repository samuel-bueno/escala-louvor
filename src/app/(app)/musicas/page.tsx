import { FileUp, ListMusic, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { FilterTabs, SearchField } from "@/components/ui/filters";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { diffDays, formatDate, todayIn } from "@/domain/dates";
import { cn } from "@/lib/cn";
import { plural } from "@/lib/plural";
import { formatDuration } from "@/lib/validation";
import { canManageSongs } from "@/domain/permissions";
import { requireUser } from "@/server/auth/session";
import { getCategories } from "@/server/queries/core";
import { listSongs } from "@/server/queries/songs";

export const metadata: Metadata = { title: "Músicas" };

const SORTS = { titulo: "A–Z", esquecidas: "Há mais tempo sem tocar", mais: "Mais tocadas" } as const;

export default async function SongsPage({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string; ordem?: string; inativas?: string }> }) {
  const user = await requireUser();
  const isAdmin = canManageSongs(user);
  const sp = await searchParams;
  const today = todayIn();
  const [songs, categories] = await Promise.all([listSongs(user.organizationId, { includeInactive: isAdmin }), getCategories(user.organizationId)]);
  const showInactive = isAdmin && sp.inativas === "1";
  const q = (sp.q ?? "").trim().toLowerCase();
  const sort = (sp.ordem && sp.ordem in SORTS ? sp.ordem : "titulo") as keyof typeof SORTS;
  let list = songs.filter(
    (s) => (showInactive || s.active) && (!sp.cat || s.categoryId === sp.cat) && (!q || `${s.title} ${s.artist ?? ""} ${s.theme ?? ""} ${s.tags.join(" ")}`.toLowerCase().includes(q)),
  );
  if (sort === "esquecidas") list = [...list].sort((a, b) => (a.lastPlayed ?? "0000").localeCompare(b.lastPlayed ?? "0000"));
  if (sort === "mais") list = [...list].sort((a, b) => b.playCount - a.playCount);
  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.cat ? { cat: sp.cat } : {}), ...(sort !== "titulo" ? { ordem: sort } : {}), ...(showInactive ? { inativas: "1" } : {}) });
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const s = p.toString();
    return `/musicas${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Músicas"
        subtitle={`${songs.filter((s) => s.active).length} ${plural(songs.filter((s) => s.active).length, "música", "músicas")} na biblioteca`}
        actions={
          isAdmin && (
            <>
              <ButtonLink href="/musicas/importar" variant="secondary" size="sm" icon={<FileUp className="h-4 w-4" aria-hidden />}>
                Importar lista
              </ButtonLink>
              <ButtonLink href="/musicas/nova" size="sm" icon={<Plus className="h-4 w-4" aria-hidden />}>
                Nova música
              </ButtonLink>
            </>
          )
        }
      />
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchField defaultValue={sp.q} label="Buscar música" placeholder="Título, artista ou tema" hidden={{ cat: sp.cat, ordem: sort !== "titulo" ? sort : undefined }} className="sm:w-80" />
          <FilterTabs label="Ordenar" items={Object.entries(SORTS).map(([k, l]) => ({ href: href({ ordem: k === "titulo" ? undefined : k }), label: l, active: sort === k }))} />
        </div>
        <FilterTabs
          label="Filtrar por categoria"
          items={[{ href: href({ cat: undefined }), label: "Todas", active: !sp.cat }, ...categories.map((c) => ({ href: href({ cat: c.id }), label: c.name, active: sp.cat === c.id }))]}
        />
      </div>

      {list.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ListMusic />}
            title={songs.length === 0 ? "Nenhuma música cadastrada" : "Nenhuma música encontrada"}
            description={songs.length === 0 ? "Cadastre uma a uma ou cole uma lista de nomes e links." : "Ajuste a busca ou o filtro."}
            action={
              isAdmin &&
              songs.length === 0 && (
                <div className="flex flex-wrap justify-center gap-2">
                  <ButtonLink href="/musicas/nova">Adicionar primeira música</ButtonLink>
                  <ButtonLink href="/musicas/importar" variant="secondary">
                    Importar lista
                  </ButtonLink>
                </div>
              )
            }
          />
        </Card>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
          {/* Cabeçalho estilo tracklist: só no desktop */}
          <div className={cn(cols, "hidden gap-x-4 border-b border-border px-4 py-2 text-[11.5px] font-medium text-muted md:grid")}>
            <span className="text-right">#</span>
            <span>Título</span>
            <span>Tom</span>
            <span className="text-right">BPM</span>
            <span className="text-right">Duração</span>
            <span>Última vez</span>
            <span className="text-right">Vezes</span>
          </div>
          <ol className="divide-y divide-border">
            {list.map((s, i) => {
              const forgotten = s.active && s.lastPlayed && diffDays(today, s.lastPlayed) > 90;
              return (
                <li key={s.id}>
                  <Link href={`/musicas/${s.id}`} className={cn("group grid grid-cols-[2.25rem_1fr_auto] items-center gap-x-3 px-4 py-2.5 transition-colors hover:bg-surface-2/60 md:gap-x-4", cols, !s.active && "opacity-55")}>
                    <span className="tabular text-right font-mono text-[12px] text-subtle">
                      <span className="group-hover:hidden">{i + 1}</span>
                      <span className="hidden text-accent group-hover:inline" aria-hidden>
                        ♪
                      </span>
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[14px] font-medium">{s.title}</span>
                        {!s.active && <Badge>Inativa</Badge>}
                      </span>
                      <span className="block truncate text-[12.5px] text-muted">
                        {[s.artist, s.categoryName].filter(Boolean).join(" · ") || "—"}
                        <span className="md:hidden">
                          {s.bpm ? ` · ${s.bpm} bpm` : ""}
                          {s.lastPlayed ? ` · ${s.playCount}×` : ""}
                        </span>
                      </span>
                    </span>
                    <span className={cn("font-mono text-[13px]", s.originalKey ? "text-accent" : "text-subtle")}>{s.originalKey ?? "—"}</span>
                    <span className="hidden text-right font-mono text-[12.5px] text-muted md:block">{s.bpm ?? "—"}</span>
                    <span className="hidden text-right font-mono text-[12.5px] text-muted md:block">{s.durationSec ? formatDuration(s.durationSec) : "—"}</span>
                    <span className="hidden text-[12.5px] md:block">
                      {s.lastPlayed ? <span className={cn("font-mono", forgotten ? "text-info" : "text-muted")}>{formatDate(s.lastPlayed)}</span> : <span className="text-subtle">nunca</span>}
                    </span>
                    <span className="tabular hidden text-right font-mono text-[12.5px] text-muted md:block">{s.playCount || "—"}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>
      )}
      {isAdmin && songs.some((s) => !s.active) && (
        <p className="mt-4 text-center">
          <Link href={href({ inativas: showInactive ? undefined : "1" })} className="link-action">
            {showInactive ? "Ocultar inativas" : "Mostrar inativas"}
          </Link>
        </p>
      )}
    </>
  );
}

const cols = "md:grid-cols-[2rem_minmax(0,1fr)_3.5rem_3.5rem_4rem_6.5rem_3rem]";

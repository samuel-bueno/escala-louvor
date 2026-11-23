import { ExternalLink, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/layout/back-link";
import { ActionButton } from "@/components/ui/action-button";
import { ButtonLink } from "@/components/ui/button";
import { Badge, PageHeader, Section } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { canManageSongs } from "@/domain/permissions";
import { formatDate } from "@/domain/dates";
import { formatDuration } from "@/lib/validation";
import { deleteSongAction, setSongActiveAction } from "@/server/actions/songs";
import { requireUser } from "@/server/auth/session";
import { getCategories } from "@/server/queries/core";
import { getSong } from "@/server/queries/songs";
import { plural } from "@/lib/plural";

export const metadata: Metadata = { title: "Música" };

const DIFF = ["", "Fácil", "Média", "Difícil"];

export default async function SongPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const isAdmin = user.role === "admin";
  const canManage = canManageSongs(user);
  const [song, categories] = await Promise.all([getSong(user.organizationId, id), getCategories(user.organizationId)]);
  if (!song || (!canManage && !song.active)) notFound();
  const category = categories.find((c) => c.id === song.categoryId);

  return (
    <>
      <PageHeader
        back={<BackLink href="/musicas" label="Músicas" />}
        title={song.title}
        subtitle={[song.artist, category?.name].filter(Boolean).join(" · ") || undefined}
        actions={
          canManage && (
            <ButtonLink href={`/musicas/${id}/editar`} variant="secondary" size="sm" icon={<Pencil className="h-4 w-4" aria-hidden />}>
              Editar
            </ButtonLink>
          )
        }
      />
      {!song.active && (
        <Badge tone="neutral" className="mb-4">
          Inativa — não entra na geração automática
        </Badge>
      )}
      {/* Ficha técnica: valores em mono, como o rótulo de uma partitura */}
      <dl className="mb-8 grid grid-cols-3 border-y border-border sm:grid-cols-6">
        {[
          ["Tom", song.originalKey ?? "—", true],
          ["BPM", song.bpm ?? "—", false],
          ["Duração", formatDuration(song.durationSec) || "—", false],
          ["Dificuldade", song.difficulty ? DIFF[song.difficulty] : "—", false],
          ["Tocada", song.plays.length ? `${song.plays.length >= 20 ? "20+" : song.plays.length}×` : "—", false],
          ["Última vez", song.plays[0] ? formatDate(song.plays[0].date) : "nunca", false],
        ].map(([label, value, accent], i) => (
          <div key={String(label)} className={cn("px-3 py-3 first:pl-0 sm:px-4", i % 3 !== 0 && "border-l border-border", i >= 3 && "border-t border-border sm:border-t-0", i === 3 && "pl-0 sm:border-l sm:pl-4")}>
            <dt className="eyebrow">{label}</dt>
            <dd className={cn("mt-1 font-mono text-[17px]", accent ? "text-accent" : "text-fg")}>{value}</dd>
          </div>
        ))}
      </dl>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-10">
        <div className="flex min-w-0 flex-col gap-8">
          <Section title="Ouvir e cifras">
            {song.url || song.links.length ? (
              <ul className="divide-y divide-border rounded-[var(--radius-card)] border border-border bg-surface">
                {song.url && <LinkRow href={song.url} label="Link principal" />}
                {song.links.map((l) => (
                  <LinkRow key={l.id} href={l.url} label={l.label ?? "Link"} />
                ))}
              </ul>
            ) : (
              <p className="text-[13.5px] text-muted">Nenhum link cadastrado.</p>
            )}
          </Section>
          {(song.theme || song.tags.length > 0 || song.notes) && (
            <Section title="Notas">
              {(song.theme || song.tags.length > 0) && (
                <p className="text-[13.5px] text-fg-2">
                  {song.theme && <>Tema: {song.theme}</>}
                  {song.tags.filter((t) => t !== song.theme).length > 0 && <span className="text-muted">{song.theme ? " · " : ""}{song.tags.filter((t) => t !== song.theme).join(", ")}</span>}
                </p>
              )}
              {song.notes && <p className="mt-2 max-w-prose text-[13.5px] whitespace-pre-line text-muted">{song.notes}</p>}
            </Section>
          )}
        </div>
        <div className="flex flex-col gap-8">
          <Section title="Histórico" hint={song.plays.length ? `${song.plays.length} ${plural(song.plays.length, "recente", "recentes")}` : undefined}>
            {song.plays.length ? (
              <ul className="divide-y divide-border border-y border-border">
                {song.plays.map((p, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-2 text-[13.5px]">
                    {p.eventId ? (
                      <Link href={`/eventos/${p.eventId}`} className="truncate hover:text-accent">
                        {p.title ?? "Culto"}
                      </Link>
                    ) : (
                      <span>Registro manual</span>
                    )}
                    <span className="tabular shrink-0 font-mono text-[12.5px] text-muted">{formatDate(p.date)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13.5px] text-muted">Ainda não foi tocada em cultos concluídos.</p>
            )}
          </Section>
          {canManage && (
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <ActionButton
                size="sm"
                action={setSongActiveAction.bind(null, id, !song.active)}
                confirm={song.active ? { title: "Desativar música?", description: "Ela continua no histórico, mas não entra mais na geração automática.", confirmLabel: "Desativar" } : undefined}
              >
                {song.active ? "Desativar" : "Reativar"}
              </ActionButton>
              {isAdmin && (
              <ActionButton
                size="sm"
                action={deleteSongAction.bind(null, id)}
                variant="dangerGhost"
                confirm={{ title: "Excluir música?", description: "Só é possível excluir músicas nunca usadas em repertórios. Caso contrário, desative.", confirmLabel: "Excluir", danger: true }}
              >
                Excluir
              </ActionButton>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function LinkRow({ href, label }: { href: string; label: string }) {
  let host = href;
  try {
    host = new URL(href).hostname.replace(/^www\./, "");
  } catch {}
  return (
    <li>
      <a href={href} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center gap-3 px-4 py-2 hover:bg-surface-2/60">
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-medium">{label}</span>
          <span className="block truncate font-mono text-[12px] text-muted">{host}</span>
        </span>
        <ExternalLink className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
      </a>
    </li>
  );
}

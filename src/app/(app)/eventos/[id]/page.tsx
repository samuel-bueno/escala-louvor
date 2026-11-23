import { ExternalLink, Lock, Pencil, Repeat, Users } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/layout/back-link";
import { ButtonLink } from "@/components/ui/button";
import { Callout, Card, EmptyState, Section } from "@/components/ui/primitives";
import { ago, formatDate, formatDayMonth, formatInstant, todayIn, weekdayName } from "@/domain/dates";
import { EventAdminActions, PublishScheduleButton } from "@/features/events/event-admin-actions";
import { categoryDot, categoryOf, DateBlock, EventStatusBadge } from "@/features/events/event-ui";
import { AlertList } from "@/features/schedule/alert-list";
import { TeamList } from "@/features/schedule/team-list";
import { cn } from "@/lib/cn";
import { areasEditable, canEditSetlist, isLeader } from "@/domain/permissions";
import { SlotResponse } from "@/features/schedule/slot-response";
import { ShareLinks } from "@/features/events/share-links";
import { formatDuration, EVENT_TYPE_LABELS } from "@/lib/validation";
import { computeEventAlerts } from "@/server/actions/schedule-helpers";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { events, shareLinks } from "@/server/db/schema";
import { getEvent, getEventSlots, getSetlist } from "@/server/queries/events";
import { plural } from "@/lib/plural";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const user = await requireUser();
  const ev = await getEvent(user.organizationId, (await params).id);
  return { title: ev ? `${ev.title} ${formatDayMonth(ev.date)}` : "Não encontrado" };
}

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const ev = await getEvent(user.organizationId, id);
  const isAdmin = user.role === "admin";
  const leader = isLeader(user);
  const canSetlist = canEditSetlist(user);
  // Rascunhos são da liderança: membros não veem escala ainda não publicada.
  if (!ev || (!leader && ev.status === "draft")) notFound();

  const [slots, setlist, alerts, links] = await Promise.all([
    getEventSlots(id),
    getSetlist(id),
    leader ? computeEventAlerts(user.organizationId, ev) : Promise.resolve([]),
    isAdmin
      ? db
          .select()
          .from(shareLinks)
          .where(and(eq(shareLinks.eventId, id), isNull(shareLinks.revokedAt), gt(shareLinks.expiresAt, new Date())))
          .orderBy(desc(shareLinks.createdAt))
      : Promise.resolve([]),
  ]);
  const today = todayIn();
  const mySlots = slots.filter((s) => s.participantId && s.participantId === user.participantId);
  const canRespond = (ev.status === "pending" || ev.status === "published") && ev.date >= today;
  const filled = slots.filter((s) => s.participantId || s.guestName);
  const confirmed = filled.filter((s) => s.status === "confirmed" && s.participantId).length;
  const declined = filled.filter((s) => s.status === "declined").length;
  const totalSec = setlist.reduce((a, s) => a + (s.durationSec ?? 0), 0);

  const rehearsal = ev.rehearsalId ? await getEvent(user.organizationId, ev.rehearsalId) : null;
  const linkedServices = ev.type === "ensaio" ? await db.select({ id: events.id, title: events.title, date: events.date }).from(events).where(and(eq(events.organizationId, user.organizationId), eq(events.rehearsalId, ev.id))) : [];
  const cat = categoryOf(ev.type);

  return (
    <>
      <BackLink href="/agenda" label="Agenda" />
      <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <DateBlock date={ev.date} size="lg" muted={ev.status === "cancelled"} />
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[12.5px] text-muted">
              <span aria-hidden className={cn("h-2 w-2 rounded-full", categoryDot[cat])} />
              {EVENT_TYPE_LABELS[ev.type]}
              {ev.recurrenceId && (
                <span className="inline-flex items-center gap-1" title="Faz parte de uma série recorrente">
                  <Repeat className="h-3 w-3" aria-hidden /> série
                </span>
              )}
              <span aria-hidden className="text-subtle">·</span>
              <EventStatusBadge status={ev.status} />
            </p>
            <h1 className={cn("mt-1 text-[22px] leading-tight font-semibold text-balance sm:text-[24px]", ev.status === "cancelled" && "line-through decoration-1")}>{ev.title}</h1>
            <p className="mt-1 text-[13.5px] text-muted">
              {weekdayName(ev.date)}, {formatDate(ev.date)} ·{" "}
              <span className="font-mono text-[13px] text-fg-2">
                {ev.startTime}
                {ev.endTime ? `–${ev.endTime}` : ""}
              </span>
              {ev.location && <> · {ev.location}</>}
            </p>
          </div>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <ButtonLink href={`/eventos/${id}/editar`} variant="secondary" size="sm" icon={<Pencil className="h-4 w-4" aria-hidden />}>
              Editar
            </ButtonLink>
            <EventAdminActions eventId={id} status={ev.status} hasWarnings={alerts.some((a) => a.severity === "warning")} recurring={!!ev.recurrenceId} />
          </div>
        )}
        {!isAdmin && leader && ev.status === "draft" && (
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <PublishScheduleButton eventId={id} disabled={filled.length === 0} />
          </div>
        )}
      </header>

      {ev.status === "cancelled" && (
        <Callout tone="danger" className="mb-6" title="Evento cancelado">
          {ev.recurrenceId ? "Só esta data foi cancelada; a série continua. " : ""}A escala e o repertório ficam guardados para histórico.
        </Callout>
      )}

      {mySlots.length > 0 && (
        <section className="mb-6 rounded-[var(--radius-card)] border border-accent/25 bg-accent-soft px-4 py-3.5">
          <p className="text-[14px]">
            Você está escalado(a) como <span className="font-semibold">{mySlots.map((s) => s.functionName).join(" e ")}</span>
          </p>
          {ev.confirmDeadline && <p className="text-[13px] text-muted">Confirme até {formatDayMonth(ev.confirmDeadline)}.</p>}
          {canRespond && (
            <div className="mt-3 flex flex-col gap-3">
              {mySlots.map((s) => (
                <div key={s.id}>
                  {mySlots.length > 1 && <p className="mb-1 text-[13px] font-medium">{s.functionName}</p>}
                  <SlotResponse slotId={s.id} status={s.status} />
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
        <div className="flex min-w-0 flex-col gap-8">
          <Section
           
            title="Equipe"
            hint={slots.length ? `${filled.length}/${slots.length} · ${confirmed} ${plural(confirmed, "confirmado", "confirmados")}${declined ? ` · ${declined} ${plural(declined, "recusa", "recusas")}` : ""}` : undefined}
            action={
              leader && (
                <span className="flex items-center gap-3">
                  {ev.scheduleLocked && (
                    <span className="inline-flex items-center gap-1 text-[12px] text-muted">
                      <Lock className="h-3 w-3" aria-hidden /> bloqueada
                    </span>
                  )}
                  <Link href={`/escalas?culto=${id}`} className="link-action">
                    {filled.length ? "Revisar escala" : "Montar escala"}
                  </Link>
                </span>
              )
            }
          >
            {leader && alerts.length > 0 && (
              <div className="mb-3">
                <AlertList alerts={alerts} compact />
              </div>
            )}
            {slots.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<Users />}
                  title={leader ? "Este culto ainda não tem escala" : "A escala deste culto ainda não foi publicada"}
                  description={leader ? "Defina as funções necessárias e escolha as pessoas." : "Assim que a liderança publicar, você vê quem serve e confirma sua participação."}
                  action={areasEditable(user).length > 0 && <ButtonLink href={`/eventos/${id}/escala`}>Definir equipe</ButtonLink>}
                />
              </Card>
            ) : (
              <Card>
                <TeamList slots={slots} showStatus={ev.status !== "draft"} showAdmin={leader} showReason={isAdmin} grouped />
              </Card>
            )}
          </Section>

          {ev.notes && (
            <Section title="Observações">
              <p className="max-w-prose text-[14px] whitespace-pre-line text-fg-2">{ev.notes}</p>
            </Section>
          )}
        </div>

        <div className="flex flex-col gap-8">
          <Section
           
            title="Repertório"
            hint={setlist.length ? `${setlist.length} ${plural(setlist.length, "música", "músicas")}${totalSec ? ` · ~${Math.round(totalSec / 60)} min` : ""}` : undefined}
            action={canSetlist && <Link href={`/eventos/${id}/repertorio`} className="link-action">{setlist.length ? "Editar" : "Montar"}</Link>}
          >
            {ev.theme && <p className="mb-2 text-[13px] text-muted">Tema: <span className="text-fg-2">{ev.theme}</span></p>}
            {setlist.length > 0 && ev.setlistUpdatedAt && (
              <p className="mb-2 text-[12.5px] text-muted">
                Atualizado {ago(ev.setlistUpdatedAt)}
                {ev.setlistUpdatedBy ? ` por ${ev.setlistUpdatedBy}` : ""}
              </p>
            )}
            {setlist.length === 0 ? (
              <p className="text-[13.5px] text-muted">{canSetlist ? "Repertório ainda não definido." : "Repertório ainda não finalizado pela liderança vocal."}</p>
            ) : (
              <ol className="divide-y divide-border border-y border-border">
                {setlist.map((s, i) => (
                  <li key={s.id} className="flex items-start gap-3 py-2.5">
                    <span className="tabular w-5 shrink-0 pt-0.5 text-right font-mono text-[12.5px] text-subtle">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium">{s.title}</p>
                      <p className="truncate text-[12.5px] text-muted">{[s.artist, s.categoryName].filter(Boolean).join(" · ")}</p>
                      {s.notes && <p className="text-[12.5px] text-fg-2">{s.notes}</p>}
                      {(s.url || s.links.length > 0) && (
                        <div className="mt-1 flex flex-wrap gap-x-3">
                          {s.url && <ExtLink href={s.url} label="Ouvir" />}
                          {s.links.map((l) => (
                            <ExtLink key={l.id} href={l.url} label={l.label ?? "Link"} />
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="shrink-0 text-right font-mono text-[12.5px] leading-5">
                      {(s.key ?? s.originalKey) ? <span className="block text-accent">{s.key ?? s.originalKey}</span> : <span className="block text-warning">sem tom</span>}
                      {s.key && s.originalKey && s.key !== s.originalKey && <span className="block text-[11px] text-muted">orig. {s.originalKey}</span>}
                      {s.durationSec ? <span className="block text-muted">{formatDuration(s.durationSec)}</span> : null}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Section>

          {ev.type !== "ensaio" && (
            <Section title="Ensaio">
              {rehearsal ? (
                <Link href={`/eventos/${rehearsal.id}`} className="flex items-center gap-3 rounded-[var(--radius-card)] border border-border bg-surface px-3 py-2.5 hover:border-border-strong">
                  <span aria-hidden className="h-2 w-2 rounded-full bg-cat-ensaio" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{rehearsal.title}</span>
                    <span className="block text-[12.5px] text-muted">
                      {weekdayName(rehearsal.date)}, {formatDayMonth(rehearsal.date)} · <span className="font-mono">{rehearsal.startTime}</span>
                    </span>
                  </span>
                </Link>
              ) : (
                <p className="text-[13.5px] text-muted">
                  Nenhum ensaio vinculado.
                  {isAdmin && (
                    <>
                      {" "}
                      <Link href={`/eventos/${id}/editar`} className="link-action">
                        Vincular
                      </Link>
                    </>
                  )}
                </p>
              )}
            </Section>
          )}
          {linkedServices.length > 0 && (
            <Section title="Ensaio para">
              <ul className="flex flex-col gap-1">
                {linkedServices.map((l) => (
                  <li key={l.id}>
                    <Link href={`/eventos/${l.id}`} className="text-[13.5px] hover:text-accent">
                      {l.title} · <span className="font-mono text-[12.5px] text-muted">{formatDayMonth(l.date)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {isAdmin && ev.status !== "draft" && ev.status !== "cancelled" && (
            <ShareLinks eventId={id} links={links.map((l) => ({ id: l.id, expiresAt: formatInstant(l.expiresAt), createdAt: formatInstant(l.createdAt) }))} />
          )}
        </div>
      </div>
    </>
  );
}

function ExtLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex h-7 items-center gap-1 text-[12.5px] text-accent hover:underline">
      <ExternalLink className="h-3 w-3" aria-hidden />
      {label}
    </a>
  );
}

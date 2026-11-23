import { ChevronLeft, ChevronRight, Layers, PencilLine } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BackLink } from "@/components/layout/back-link";
import { Avatar } from "@/components/ui/avatar";
import { ActionButton } from "@/components/ui/action-button";
import { ButtonLink } from "@/components/ui/button";
import { acceptSwapSuggestionAction } from "@/server/actions/schedule";
import { AvailabilityMark, Badge, Card, EmptyState, List, PageHeader } from "@/components/ui/primitives";
import { addDays, ago, formatDate, formatDayMonth, relativeDay, todayIn, weekdayName } from "@/domain/dates";
import { describeCandidates, type CandidateInfo } from "@/domain/scheduling/candidates";
import { PublishScheduleButton } from "@/features/events/event-admin-actions";
import { DateBlock, EventStatusBadge } from "@/features/events/event-ui";
import { AlertList } from "@/features/schedule/alert-list";
import { ConfirmationStatus } from "@/features/schedule/confirmation-status";
import { QuickGenerate } from "@/features/schedule/quick-generate";
import { sortSlots } from "@/features/schedule/team-list";
import { cn } from "@/lib/cn";
import { computeEventAlerts } from "@/server/actions/schedule-helpers";
import { AREA_LABELS, areaOfKind, areasEditable, canEditSetlist, canPublishSchedule, type Area } from "@/domain/permissions";
import { requireLeaderPage } from "@/server/auth/session";
import { plural } from "@/lib/plural";
import { getRules } from "@/server/queries/core";
import { getEvent, getEventSlots, getSetlist, historyWindow, listEvents, loadAssignments, type EventListItem } from "@/server/queries/events";
import { loadSchedParticipants } from "@/server/queries/participants";

export const metadata: Metadata = { title: "Escalas" };

const STEPS = ["Culto", "Funções", "Pessoas", "Sugestão", "Publicar"];

function markOf(c: CandidateInfo): "ok" | "conflict" | "unavailable" {
  if (c.issues.includes("indisponível")) return "unavailable";
  return c.issues.length ? "conflict" : "ok";
}

export default async function EscalasPage({ searchParams }: { searchParams: Promise<{ culto?: string }> }) {
  const user = await requireLeaderPage();
  const { culto } = await searchParams;
  const today = todayIn();
  const services = (await listEvents(user.organizationId, today, addDays(today, 84))).filter((e) => e.type !== "ensaio" && e.status !== "completed");
  const selectedId = culto ?? null;

  return (
    <>
      <PageHeader
        title="Escalas"
        subtitle="Escolha um culto, veja quem pode servir em cada função e gere uma sugestão para revisar."
        actions={
          <ButtonLink href="/escalas/gerar" variant="secondary" size="sm" icon={<Layers className="h-4 w-4" aria-hidden />}>
            Gerar várias de uma vez
          </ButtonLink>
        }
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-8">
        <div className={cn(selectedId && "hidden lg:block")}>
          <ServiceList services={services} selectedId={selectedId} today={today} />
        </div>
        <div className={cn("min-w-0", !selectedId && "hidden lg:block")}>
          {selectedId ? (
            <ServiceDetail user={user} eventId={selectedId} today={today} />
          ) : (
            <Card>
              <EmptyState icon={<ChevronLeft />} title="Escolha um culto" description="Selecione um culto na lista para montar ou revisar a escala." />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function ServiceList({ services, selectedId, today }: { services: EventListItem[]; selectedId: string | null; today: string }) {
  if (!services.length)
    return (
      <Card>
        <EmptyState title="Nenhum culto nas próximas 12 semanas" action={<ButtonLink href="/eventos/novo">Novo evento</ButtonLink>} />
      </Card>
    );
  return (
    <nav aria-label="Cultos">
      <p className="eyebrow mb-2">Próximas 12 semanas</p>
      <List>
        {services.map((e) => {
          const missing = e.slotsTotal - e.slotsFilled;
          const state = e.slotsTotal === 0 ? "vazia" : missing > 0 ? `${missing} em aberto` : e.declined ? `${e.declined} recusa` : e.status === "draft" ? "rascunho" : "pronta";
          const tone = e.slotsTotal === 0 || missing > 0 ? "text-warning" : e.declined ? "text-danger" : e.status === "draft" ? "text-muted" : "text-success";
          const active = e.id === selectedId;
          return (
            <li key={e.id}>
              <Link
                href={`/escalas?culto=${e.id}`}
                aria-current={active ? "page" : undefined}
                className={cn("flex items-center gap-3 px-3 py-2.5 transition-colors", active ? "bg-surface-2" : "hover:bg-surface-2/60")}
              >
                <span className={cn("h-8 w-0.5 shrink-0 rounded-full", active ? "bg-accent" : "bg-transparent")} aria-hidden />
                <span className="w-16 shrink-0">
                  <span className="block text-[11px] text-muted uppercase">{weekdayName(e.date).slice(0, 3)}</span>
                  <span className="tabular block font-mono text-[13.5px]">{formatDayMonth(e.date)}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium">{e.title}</span>
                  <span className={cn("block text-[12px]", tone)}>
                    {state}
                    {e.date === today && <span className="text-muted"> · hoje</span>}
                  </span>
                </span>
                <span className="tabular shrink-0 font-mono text-[12px] text-muted">
                  {e.slotsFilled}/{e.slotsTotal}
                </span>
              </Link>
            </li>
          );
        })}
      </List>
    </nav>
  );
}

async function ServiceDetail({ user, eventId, today }: { user: Awaited<ReturnType<typeof requireLeaderPage>>; eventId: string; today: string }) {
  const orgId = user.organizationId;
  const ev = await getEvent(orgId, eventId);
  if (!ev)
    return (
      <Card>
        <EmptyState title="Culto não encontrado" action={<ButtonLink href="/escalas">Voltar</ButtonLink>} />
      </Card>
    );
  const win = historyWindow(ev.date, ev.date);
  const [slots, people, others, rules, alerts, setlist] = await Promise.all([
    getEventSlots(eventId),
    loadSchedParticipants(orgId, ev.date, ev.date),
    loadAssignments(orgId, win.from, win.to, [eventId]),
    getRules(orgId),
    computeEventAlerts(orgId, ev),
    getSetlist(eventId),
  ]);
  const filled = slots.filter((s) => s.participantId || s.guestName).length;
  const editable = ev.status !== "cancelled" && ev.status !== "completed";
  const mine = new Set(areasEditable(user));
  const canPublish = canPublishSchedule(user);
  const step = slots.length === 0 ? 1 : filled < slots.length ? 3 : ev.status === "draft" ? 4 : 5;
  const areas = (["vocal", "instrumental", "other"] as const).map((area) => ({ area, list: sortSlots(slots).filter((x) => areaOfKind(x.functionKind) === area) })).filter((g) => g.list.length > 0)
    .sort((a, b) => Number(mine.has(b.area)) - Number(mine.has(a.area)));
  const tonless = setlist.filter((x) => !(x.key ?? x.originalKey)).length;
  const canSetlist = canEditSetlist(user);

  return (
    <div className="flex flex-col gap-5">
      <div className="lg:hidden">
        <BackLink href="/escalas" label="Todos os cultos" />
      </div>

      <Card>
        <div className="flex items-start gap-4 px-4 py-4 sm:px-5">
          <DateBlock date={ev.date} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="eyebrow">{relativeDay(ev.date, today)}</p>
            <h2 className="mt-0.5 text-[18px] leading-snug font-semibold">{ev.title}</h2>
            <p className="mt-0.5 text-[13px] text-muted">
              {weekdayName(ev.date)}, {formatDate(ev.date)} · <span className="font-mono text-[12.5px]">{ev.startTime}</span>
              {ev.location && <> · {ev.location}</>}
            </p>
          </div>
          <EventStatusBadge status={ev.status} />
        </div>
        <ol className="flex border-t border-border px-4 py-2.5 text-[12px] sm:px-5" aria-label="Etapas">
          {STEPS.map((s, i) => (
            <li key={s} className={cn("flex flex-1 items-center gap-1.5", i + 1 < step ? "text-fg-2" : i + 1 === step ? "font-medium text-fg" : "text-subtle")} aria-current={i + 1 === step ? "step" : undefined}>
              <span className={cn("tabular grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full font-mono text-[10.5px]", i + 1 < step ? "bg-surface-3" : i + 1 === step ? "bg-accent text-white" : "border border-border-strong")}>
                {i + 1 < step ? "✓" : i + 1}
              </span>
              <span className="hidden truncate sm:inline">{s}</span>
            </li>
          ))}
        </ol>
        {editable && (
          <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3 sm:px-5">
            {mine.size > 0 && slots.length > 0 && !ev.scheduleLocked && <QuickGenerate eventId={ev.id} hasFilled={filled > 0} />}
            {mine.size > 0 && (
              <ButtonLink href={`/eventos/${ev.id}/escala`} variant="secondary" size="sm" icon={<PencilLine className="h-4 w-4" aria-hidden />}>
                {slots.length ? "Ajustar manualmente" : "Definir funções"}
              </ButtonLink>
            )}
            {canSetlist && (
              <ButtonLink href={`/eventos/${ev.id}/repertorio`} variant="secondary" size="sm">
                Preparar repertório
              </ButtonLink>
            )}
            {canPublish && ev.status === "draft" && <PublishScheduleButton eventId={ev.id} disabled={filled === 0} />}
            <ButtonLink href={`/eventos/${ev.id}`} variant="ghost" size="sm">
              Ver culto
            </ButtonLink>
          </div>
        )}
      </Card>

      {/* Repertório: quem monta a banda precisa ver como está, sem poder alterar. */}
      <p className="text-[13px] text-muted" role="status">
        {setlist.length === 0 ? (
          canSetlist ? (
            <>Repertório ainda não definido. </>
          ) : (
            <>Repertório ainda não finalizado pela liderança vocal. Você pode começar a montar a banda mesmo assim. </>
          )
        ) : (
          <>
            <span className="text-fg-2">Repertório:</span> <span className="font-mono text-[12.5px]">{setlist.length}</span> {plural(setlist.length, "música", "músicas")}
            {tonless > 0 && <span className="text-warning"> · {tonless} sem tom definido</span>}
            {ev.setlistUpdatedAt && (
              <>
                {" "}
                · atualizado {ago(ev.setlistUpdatedAt)}
                {ev.setlistUpdatedBy ? ` por ${ev.setlistUpdatedBy}` : ""}
              </>
            )}
            .{" "}
          </>
        )}
        <Link href={canSetlist ? `/eventos/${ev.id}/repertorio` : `/eventos/${ev.id}`} className="link-action">
          {canSetlist ? "Abrir repertório" : "Ver repertório"}
        </Link>
      </p>

      {ev.scheduleLocked && <p className="text-[13px] text-muted">A escala deste culto está bloqueada: a geração automática não altera nada.</p>}
      {alerts.length > 0 && <AlertList alerts={alerts} compact />}

      {slots.length === 0 ? (
        <Card>
          <EmptyState
            title="Este culto ainda não tem escala"
            description={mine.size ? "Defina quais funções ele precisa. Depois o app sugere as pessoas." : "A liderança ainda não definiu as funções deste culto."}
            action={editable && mine.size > 0 && <ButtonLink href={`/eventos/${ev.id}/escala`}>Definir funções</ButtonLink>}
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
            <span className="inline-flex items-center gap-1">
              <AvailabilityMark state="ok" /> disponível
            </span>
            <span className="inline-flex items-center gap-1">
              <AvailabilityMark state="conflict" /> conflito
            </span>
            <span className="inline-flex items-center gap-1">
              <AvailabilityMark state="unavailable" /> indisponível
            </span>
          </p>
          {areas.map(({ area, list }) => (
            <AreaSection key={area} area={area} list={list} editable={mine.has(area) && editable} slots={slots} people={people} others={others} rules={rules} ev={ev} />
          ))}
          {filled === slots.length && ev.status !== "draft" && (
            <div className="flex items-center gap-2 text-[13px] text-muted">
              <Badge tone="success">Escala publicada</Badge>
              <span>A equipe já pode confirmar.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AreaSection({
  area,
  list,
  editable,
  slots,
  people,
  others,
  rules,
  ev,
}: {
  area: Area;
  list: Awaited<ReturnType<typeof getEventSlots>>;
  editable: boolean;
  slots: Awaited<ReturnType<typeof getEventSlots>>;
  people: Awaited<ReturnType<typeof loadSchedParticipants>>;
  others: Awaited<ReturnType<typeof loadAssignments>>;
  rules: Awaited<ReturnType<typeof getRules>>;
  ev: NonNullable<Awaited<ReturnType<typeof getEvent>>>;
}) {
  const filled = list.filter((x) => x.participantId || x.guestName).length;
  return (
    <section aria-labelledby={`area-${area}`}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 id={`area-${area}`} className="text-[13px] font-semibold">
          {AREA_LABELS[area]}
          <span className="tabular ml-2 font-mono text-[12px] font-normal text-muted">
            {filled}/{list.length}
          </span>
        </h3>
        <span className="text-[12px] text-muted">{editable ? "você edita esta parte" : "somente leitura"}</span>
      </div>
      <List>
        {list.map((s) => {
          const taken = new Set(slots.filter((x) => x.id !== s.id && x.participantId).map((x) => x.participantId!));
          const all = describeCandidates(people, s.functionId, ev, others, rules, taken);
          const cands = all.filter((c) => c.compatible && c.id !== s.participantId);
          const current = s.participantId ? all.find((c) => c.id === s.participantId) : null;
          const okCount = cands.filter((c) => markOf(c) === "ok").length;
          const empty = !s.participantId && !s.guestName;
          return (
            <li key={s.id}>
              <details className="group" open={(empty || s.status === "declined") && editable ? true : undefined}>
                <summary className="flex min-h-12 items-center gap-3 px-4 py-2.5 hover:bg-surface-2/50 sm:px-5 [&::-webkit-details-marker]:hidden">
                  <span className="w-24 shrink-0 truncate text-[13px] text-muted sm:w-36">{s.functionName}</span>
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    {s.participantName ? (
                      <>
                        {current ? <AvailabilityMark state={markOf(current)} label={current.issues.join(", ") || "disponível"} /> : <AvailabilityMark state="unavailable" label="inativo(a) ou sem esta função" />}
                        <span className="truncate text-[14px] font-medium">{s.participantName}</span>
                      </>
                    ) : s.guestName ? (
                      <>
                        <span className="truncate text-[14px] font-medium">{s.guestName}</span>
                        <span className="shrink-0 text-[12px] text-muted">convidado</span>
                      </>
                    ) : (
                      <span className="text-[14px] text-warning">Vaga em aberto</span>
                    )}
                  </span>
                  {s.participantId && ev.status !== "draft" && <ConfirmationStatus status={s.status} />}
                  <span className="hidden shrink-0 text-[12px] text-muted sm:inline">{plural(okCount, `${okCount} livre`, `${okCount} livres`)}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-subtle transition-transform group-open:rotate-90" aria-hidden />
                </summary>
                <div className="border-t border-border bg-surface-2/40 px-4 py-2 sm:px-5">
                  {s.status === "declined" && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-[13px]">
                      <span className="text-danger">{s.participantName} pediu troca.</span>
                      {s.swapSuggestedName ? (
                        <>
                          <span className="text-muted">
                            Sugeriu <span className="font-medium text-fg-2">{s.swapSuggestedName}</span>.
                          </span>
                          {editable && (
                            <ActionButton size="sm" variant="secondary" action={acceptSwapSuggestionAction.bind(null, s.id)}>
                              Aceitar sugestão
                            </ActionButton>
                          )}
                        </>
                      ) : (
                        <span className="text-muted">Sem sugestão: escolha alguém abaixo.</span>
                      )}
                    </div>
                  )}
                  {current && current.issues.length > 0 && (
                    <p className="py-1 text-[12.5px] text-warning">
                      {s.participantName}: {current.issues.join(", ")}
                    </p>
                  )}
                  {cands.length === 0 ? (
                    <p className="py-2 text-[13px] text-muted">Ninguém mais tem {s.functionName} cadastrado.</p>
                  ) : (
                    <ul className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                      {cands.slice(0, 10).map((c) => (
                        <li key={c.id} className="flex min-h-9 items-center gap-2 text-[13.5px]">
                          <AvailabilityMark state={markOf(c)} label={c.issues.join(", ") || "disponível"} />
                          <Avatar name={c.name} size={20} muted={markOf(c) === "unavailable"} />
                          <span className={cn("min-w-0 flex-1 truncate", markOf(c) === "unavailable" && "text-muted")}>{c.name}</span>
                          <span className="shrink-0 truncate text-[12px] text-muted" title={c.issues.join(", ")}>
                            {c.issues.length ? c.issues[0] : <span className="font-mono">{c.monthCount}× no mês</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {cands.length > 10 && <p className="py-1 text-[12px] text-muted">+{cands.length - 10} {plural(cands.length - 10, "pessoa", "pessoas")}</p>}
                  {editable && (
                    <p className="pt-1 pb-2 text-[12.5px]">
                      <Link href={`/eventos/${ev.id}/escala`} className="link-action">
                        Escolher pessoa ou convidado
                      </Link>
                    </p>
                  )}
                </div>
              </details>
            </li>
          );
        })}
      </List>
    </section>
  );
}

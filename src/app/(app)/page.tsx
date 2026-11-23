import { AlertTriangle, CalendarPlus, ChevronRight, CircleAlert, UserPlus, UserX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { ButtonLink } from "@/components/ui/button";
import { HeroBackdrop } from "@/components/ui/hero-backdrop";
import { Callout, Card, EmptyState, List, Section, Stat } from "@/components/ui/primitives";
import { addDays, ago, formatDayMonth, formatLong, relativeDay, todayIn, weekdayName } from "@/domain/dates";
import { AREA_LABELS, areaOfKind, areasEditable, canEditSetlist, isLeader, roleLabel, type Area } from "@/domain/permissions";
import { CategoryDot, DateBlock, EventRow } from "@/features/events/event-ui";
import { SlotResponse } from "@/features/schedule/slot-response";
import { TeamList } from "@/features/schedule/team-list";
import { cn } from "@/lib/cn";
import { plural } from "@/lib/plural";
import { PasskeyPrompt } from "@/features/auth/passkey-ui";
import { requireUser, type CurrentUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { participants, passkeys, registrations, unavailability } from "@/server/db/schema";
import { getSettings } from "@/server/queries/core";
import { getEventSlots, getSetlist, listEvents, listSlotsForEvents, type EventListItem } from "@/server/queries/events";
import { getParticipantSchedule } from "@/server/queries/participants";

export const metadata: Metadata = { title: "Início" };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(new Date()));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

function Greeting({ name, today, line }: { name: string; today: string; line?: string }) {
  return (
    <header className="mb-6 sm:mb-8">
      <p className="eyebrow">
        {weekdayName(today)}, {formatLong(today)}
      </p>
      <h1 className="mt-1 text-[22px] leading-tight font-semibold sm:text-[24px]">
        {greeting()}, {name}
      </h1>
      {line && <p className="mt-1 text-[14px] text-muted">{line}</p>}
    </header>
  );
}

type Issue = { tone: "danger" | "warning" | "neutral"; text: string; href: string; when?: string };

function IssueList({ issues }: { issues: Issue[] }) {
  if (issues.length === 0)
    return (
      <p className="text-[13.5px] text-muted">
        <span className="mr-1.5 font-mono text-success">✓</span>
        Tudo em ordem nas próximas semanas.
      </p>
    );
  return (
    <List>
      {issues.map((it, i) => (
        <li key={i}>
          <Link href={it.href} className="flex min-h-12 items-center gap-3 px-4 py-2.5 hover:bg-surface-2/60">
            <span className={cn("shrink-0", it.tone === "danger" ? "text-danger" : it.tone === "warning" ? "text-warning" : "text-subtle")}>
              {it.tone === "danger" ? <UserX className="h-4 w-4" aria-hidden /> : it.tone === "warning" ? <AlertTriangle className="h-4 w-4" aria-hidden /> : <CircleAlert className="h-4 w-4" aria-hidden />}
            </span>
            <span className="min-w-0 flex-1 text-[14px]">{it.text}</span>
            {it.when && <span className="tabular shrink-0 font-mono text-[12px] text-muted">{it.when}</span>}
            <ChevronRight className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
          </Link>
        </li>
      ))}
    </List>
  );
}

const whenOf = (ev: EventListItem) => `${weekdayName(ev.date).slice(0, 3)} ${formatDayMonth(ev.date)}`;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const user = await requireUser();
  const { erro } = await searchParams;
  const today = todayIn();
  const firstName = (user.participantName ?? user.name).split(" ")[0];

  const hasPasskey = !!(await db.select({ id: passkeys.id }).from(passkeys).where(eq(passkeys.userId, user.id)).get());
  const prompt = <PasskeyPrompt hasPasskey={hasPasskey} />;
  const permissionNote = erro === "permissao" && (
    <Callout tone="warning" className="mb-4" role="alert">
      Você não tem acesso a essa área.
    </Callout>
  );

  if (user.role === "admin") return <TeamDashboard user={user} today={today} name={firstName} note={<>{permissionNote}{prompt}</>} />;
  if (isLeader(user)) return <TeamDashboard user={user} today={today} name={firstName} note={<>{permissionNote}{prompt}</>} />;
  return <MemberDashboard userId={user.participantId} orgId={user.organizationId} today={today} name={firstName} note={<>{permissionNote}{prompt}</>} />;
}

/**
 * Painel da liderança. Mesma estrutura para administração e líderes; o que muda é o foco:
 *  - administração: operação completa;
 *  - líder dos músicos: parte instrumental (+ repertório só para consulta);
 *  - líder dos vocais: vocais + repertório.
 */
async function TeamDashboard({ user, today, name, note }: { user: CurrentUser; today: string; name: string; note: React.ReactNode }) {
  const orgId = user.organizationId;
  const isAdmin = user.role === "admin";
  // Áreas de foco: admin vê tudo; líder vê as que lidera (nunca "técnica" como foco).
  const focus: Area[] = isAdmin ? ["vocal", "instrumental"] : (areasEditable(user).filter((a) => a !== "other") as Area[]);
  const canSetlist = canEditSetlist(user);

  const [upcoming, settings, unav, regs] = await Promise.all([
    listEvents(orgId, today, addDays(today, 45)),
    getSettings(orgId),
    db
      .select({ id: unavailability.id, name: participants.displayName, start: unavailability.startDate, end: unavailability.endDate, pid: participants.id })
      .from(unavailability)
      .innerJoin(participants, eq(participants.id, unavailability.participantId))
      .where(and(eq(unavailability.organizationId, orgId), lte(unavailability.startDate, addDays(today, 21)), gte(unavailability.endDate, today), eq(participants.active, true)))
      .orderBy(asc(unavailability.startDate))
      .limit(6),
    isAdmin ? db.select({ n: sql<number>`count(*)` }).from(registrations).where(eq(registrations.organizationId, orgId)).get() : Promise.resolve(null),
  ]);
  const pendingRegs = Number(regs?.n ?? 0);
  const services = upcoming.filter((e) => e.type !== "ensaio" && e.status !== "completed");
  const next = services[0];
  const nextRehearsal = upcoming.find((e) => e.type === "ensaio");
  const [nextSlots, nextSetlist, soon] = await Promise.all([next ? getEventSlots(next.id) : Promise.resolve([]), next ? getSetlist(next.id) : Promise.resolve([]), listSlotsForEvents(services.slice(0, 8).map((e) => e.id))]);

  // "O que resolver": agrupado por causa (nada de seis linhas iguais).
  const issues: Issue[] = [];
  const group = (evs: EventListItem[]) => (evs.length === 1 ? `/escalas?culto=${evs[0].id}` : "/escalas");
  const inFocus = (kind: string) => focus.includes(areaOfKind(kind) as Area) || (isAdmin && areaOfKind(kind) === "other");
  const evWith = (pred: (rows: typeof soon, ev: EventListItem) => boolean) => services.slice(0, 8).filter((ev) => pred(soon.filter((s) => s.eventId === ev.id), ev));

  const declinedEvs = evWith((rows) => rows.some((r) => inFocus(r.kind) && r.participantId && r.status === "declined"));
  if (declinedEvs.length) {
    const n = soon.filter((r) => inFocus(r.kind) && r.participantId && r.status === "declined" && declinedEvs.some((e) => e.id === r.eventId)).length;
    issues.push({ tone: "danger", text: `${n} ${plural(n, "recusa precisa", "recusas precisam")} de substituição`, href: group(declinedEvs), when: declinedEvs.length === 1 ? whenOf(declinedEvs[0]) : `${declinedEvs.length} cultos` });
  }
  if (isAdmin) {
    const noTeam = services.slice(0, 8).filter((e) => e.slotsTotal === 0);
    if (noTeam.length) issues.push({ tone: "warning", text: `${noTeam.length} ${plural(noTeam.length, "culto sem equipe definida", "cultos sem equipe definida")}`, href: group(noTeam), when: noTeam.length === 1 ? whenOf(noTeam[0]) : undefined });
    const noMinister = services.slice(0, 8).filter((e) => e.slotsTotal > 0 && !e.minister);
    if (noMinister.length) issues.push({ tone: "warning", text: `${noMinister.length} ${plural(noMinister.length, "culto sem ministro definido", "cultos sem ministro definido")}`, href: group(noMinister), when: noMinister.length === 1 ? whenOf(noMinister[0]) : undefined });
  }
  for (const area of focus) {
    const openEvs = evWith((rows) => rows.some((r) => areaOfKind(r.kind) === area && r.required && !r.participantId && !r.guestName));
    // Ministro já foi apontado acima para admin; aqui contam só vagas restantes.
    if (openEvs.length) {
      const n = soon.filter((r) => areaOfKind(r.kind) === area && r.required && !r.participantId && !r.guestName && openEvs.some((e) => e.id === r.eventId)).length;
      issues.push({ tone: "warning", text: `${n} ${plural(n, "vaga em aberto", "vagas em aberto")} ${area === "vocal" ? "nos vocais" : "no instrumental"}`, href: group(openEvs), when: openEvs.length === 1 ? whenOf(openEvs[0]) : `${openEvs.length} cultos` });
    }
  }
  if (isAdmin) {
    const ready = services.slice(0, 8).filter((e) => e.status === "draft" && e.slotsTotal > 0 && e.slotsFilled === e.slotsTotal);
    if (ready.length) issues.push({ tone: "neutral", text: `${ready.length} ${plural(ready.length, "escala completa aguardando publicação", "escalas completas aguardando publicação")}`, href: group(ready) });
  }
  if (canSetlist) {
    const noSongs = services.slice(0, 4).filter((e) => e.songsCount === 0);
    if (noSongs.length) issues.push({ tone: "warning", text: `${noSongs.length} ${plural(noSongs.length, "culto sem repertório", "cultos sem repertório")}`, href: noSongs.length === 1 ? `/eventos/${noSongs[0].id}/repertorio` : "/agenda", when: noSongs.length === 1 ? whenOf(noSongs[0]) : undefined });
  }

  return (
    <>
      {note}
      {pendingRegs > 0 && (
        <Link href="/pessoas/solicitacoes" className="mb-5 flex min-h-11 items-center gap-3 rounded-lg border border-accent/25 bg-accent-soft px-3.5 py-2.5 text-[13.5px] font-medium">
          <UserPlus className="h-4 w-4 text-accent" aria-hidden />
          <span className="flex-1">
            {pendingRegs} {plural(pendingRegs, "cadastro aguardando aprovação", "cadastros aguardando aprovação")}
          </span>
          <ChevronRight className="h-4 w-4 text-muted" aria-hidden />
        </Link>
      )}
      <Greeting name={name} today={today} line={isAdmin ? undefined : roleLabel(user)} />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-10">
        <div className="flex min-w-0 flex-col gap-8">
          {next ? (
            <NextService ev={next} slots={nextSlots} today={today} targetSongs={settings.defaultSongCount} user={user} focus={focus} setlist={nextSetlist} />
          ) : (
            <Card>
              <EmptyState
                icon={<CalendarPlus />}
                title="Nenhum culto nas próximas semanas"
                description={isAdmin ? "Crie um culto avulso ou ajuste a série de domingos em Configurações." : "Quando a administração criar os próximos cultos, eles aparecem aqui."}
                action={isAdmin && <ButtonLink href="/eventos/novo">Novo evento</ButtonLink>}
              />
            </Card>
          )}

          <Section title="O que resolver" hint={issues.length ? `${issues.length}` : undefined}>
            <IssueList issues={issues} />
          </Section>

          <Section title="Próximos cultos" action={<Link href="/agenda" className="link-action">Agenda</Link>}>
            {services.length > 1 ? (
              <List>
                {services.slice(1, 6).map((e) => (
                  <EventRow key={e.id} event={e} showAdmin />
                ))}
              </List>
            ) : (
              <p className="text-[13.5px] text-muted">Nenhum outro culto nos próximos 45 dias.</p>
            )}
          </Section>
        </div>

        <aside className="flex flex-col gap-8">
          <Section title="Próximo ensaio">
            {nextRehearsal ? (
              <Link href={`/eventos/${nextRehearsal.id}`} className="flex items-center gap-3 rounded-[var(--radius-card)] border border-border bg-surface px-3 py-3 hover:border-border-strong">
                <DateBlock date={nextRehearsal.date} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[14px] font-medium">
                    <CategoryDot type="ensaio" />
                    <span className="truncate">{nextRehearsal.title}</span>
                  </span>
                  <span className="mt-0.5 block text-[13px] text-muted">
                    <span className="font-mono text-[12.5px]">{nextRehearsal.startTime}</span> · {relativeDay(nextRehearsal.date, today)}
                  </span>
                </span>
              </Link>
            ) : (
              <p className="text-[13.5px] text-muted">Nenhum ensaio agendado.</p>
            )}
          </Section>

          <Section title="Indisponíveis" hint="próximas 3 semanas" action={<Link href="/disponibilidade" className="link-action">Ver</Link>}>
            {unav.length ? (
              <ul className="flex flex-col">
                {unav.map((u) => (
                  <li key={u.id}>
                    <div className="flex min-h-9 items-center gap-2 border-b border-border py-2 text-[13.5px] last:border-0">
                      <span className="font-mono text-[12px] text-danger" aria-hidden>
                        ×
                      </span>
                      <span className="min-w-0 flex-1 truncate">{u.name}</span>
                      <span className="tabular font-mono text-[12px] text-muted">{u.start === u.end ? formatDayMonth(u.start) : `${formatDayMonth(u.start)}–${formatDayMonth(u.end)}`}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13.5px] text-muted">Ninguém informou indisponibilidade.</p>
            )}
          </Section>

          {isAdmin && (
            <div className="flex flex-col gap-2">
              <ButtonLink href="/escalas/gerar" variant="secondary">
                Gerar escalas do mês
              </ButtonLink>
              <ButtonLink href="/eventos/novo" variant="ghost" icon={<CalendarPlus className="h-4 w-4" aria-hidden />}>
                Novo evento
              </ButtonLink>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

function NextService({
  ev,
  slots,
  today,
  targetSongs,
  user,
  focus,
  setlist,
}: {
  ev: EventListItem;
  slots: Awaited<ReturnType<typeof getEventSlots>>;
  today: string;
  targetSongs: number;
  user: CurrentUser;
  focus: Area[];
  setlist: Awaited<ReturnType<typeof getSetlist>>;
}) {
  const isAdmin = user.role === "admin";
  const canSetlist = canEditSetlist(user);
  const filled = slots.filter((s) => s.participantId || s.guestName);
  const hasTeam = filled.length > 0;
  const tonless = setlist.filter((s) => !(s.key ?? s.originalKey)).length;
  const head = (
    <HeroBackdrop className="rounded-t-[calc(var(--radius-card)-1px)]">
      <div className="flex items-start gap-4 px-4 py-4 sm:px-5">
        <DateBlock date={ev.date} size="lg" onDark />
        <div className="min-w-0 flex-1">
          <p className="eyebrow text-[#f4a468]!">Próximo culto · {relativeDay(ev.date, today)}</p>
          <h2 className="mt-1 text-[18px] leading-snug font-semibold text-balance">{ev.title}</h2>
          {(ev.location || ev.endTime) && (
            <p className="mt-0.5 text-[13px] text-white/75">
              {ev.endTime && <span className="font-mono text-[12.5px]">até {ev.endTime}</span>}
              {ev.endTime && ev.location && " · "}
              {ev.location}
            </p>
          )}
        </div>
        <span className="tabular shrink-0 font-mono text-[28px] leading-none font-medium tracking-tight sm:text-[32px]">{ev.startTime}</span>
      </div>
    </HeroBackdrop>
  );

  // Estado vazio orientado à ação, por papel (nada de "0 de 0" e barras vazias).
  if (!hasTeam) {
    const onlyInstrumental = !isAdmin && focus.length === 1 && focus[0] === "instrumental";
    const onlyVocal = !isAdmin && focus.length === 1 && focus[0] === "vocal";
    return (
      <Card as="section" aria-label="Próximo culto">
        {head}
        <div className="px-4 py-5 sm:px-5">
          <p className="text-[14px] font-medium">{isAdmin ? "Este culto ainda não tem escala." : onlyInstrumental ? "A escala instrumental ainda não foi concluída." : onlyVocal ? "Vocais ou repertório ainda precisam ser preparados." : "A escala deste culto ainda não foi concluída."}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {isAdmin && <ButtonLink href={`/escalas?culto=${ev.id}`}>Montar escala</ButtonLink>}
            {onlyInstrumental && <ButtonLink href={`/escalas?culto=${ev.id}`}>Abrir instrumental</ButtonLink>}
            {onlyVocal && (
              <>
                <ButtonLink href={`/escalas?culto=${ev.id}`}>Abrir vocais</ButtonLink>
                <ButtonLink href={`/eventos/${ev.id}/repertorio`} variant="secondary">
                  Preparar repertório
                </ButtonLink>
              </>
            )}
            {!isAdmin && !onlyInstrumental && !onlyVocal && <ButtonLink href={`/escalas?culto=${ev.id}`}>Abrir escala</ButtonLink>}
          </div>
        </div>
      </Card>
    );
  }

  const areaBlock = (area: Area) => {
    const list = slots.filter((s) => areaOfKind(s.functionKind) === area);
    if (!list.length) return null;
    const done = list.filter((s) => s.participantId || s.guestName);
    const missing = list.filter((s) => s.required && !s.participantId && !s.guestName).map((s) => s.functionName);
    const people = list.filter((s) => s.participantId);
    const confirmed = people.filter((s) => s.status === "confirmed").length;
    const declined = people.filter((s) => s.status === "declined").length;
    const pending = people.length - confirmed - declined;
    return (
      <div key={area} className="border-b border-border px-4 py-3.5 sm:px-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[13px] font-semibold">
            {AREA_LABELS[area]}
            <span className="tabular ml-2 font-mono text-[12px] font-normal text-muted">
              {done.length}/{list.length} {plural(list.length, "posição", "posições")}
            </span>
          </h3>
          <span className="text-[12.5px] text-muted">
            {ev.status === "draft" ? (
              "rascunho"
            ) : (
              <>
                <span className="font-mono">{confirmed}</span>/<span className="font-mono">{people.length}</span> {plural(confirmed, "confirmado", "confirmados")}
                {declined > 0 && <span className="text-danger"> · {declined} {plural(declined, "recusa", "recusas")}</span>}
                {pending > 0 && ` · ${pending} ${plural(pending, "pendente", "pendentes")}`}
              </>
            )}
          </span>
        </div>
        {missing.length > 0 && (
          <p className="mt-1 text-[13px] text-warning">
            {missing.length === 1 ? "Falta" : "Faltam"}: {[...new Set(missing)].join(", ")}
          </p>
        )}
        <div className="mt-2.5">
          <ButtonLink href={`/escalas?culto=${ev.id}`} variant="secondary" size="sm">
            {area === "instrumental" ? "Abrir instrumental" : "Abrir vocais"}
          </ButtonLink>
        </div>
      </div>
    );
  };

  return (
    <Card as="section" aria-label="Próximo culto">
      {head}
      {isAdmin ? (
        <>
          <div className="grid grid-cols-3 gap-3 border-b border-border px-4 py-3 sm:px-5">
            <Stat label="Equipe" value={`${filled.length}/${slots.length}`} tone={filled.length < slots.length ? "warning" : "neutral"} hint={filled.length < slots.length ? `${slots.length - filled.length} em aberto` : "completa"} />
            <Stat label="Confirmados" value={`${ev.confirmed}/${slots.filter((s) => s.participantId).length}`} tone={ev.declined ? "danger" : "neutral"} hint={ev.declined ? `${ev.declined} ${plural(ev.declined, "recusa", "recusas")}` : "sem recusas"} />
            <Stat label="Músicas" value={`${ev.songsCount}/${targetSongs}`} hint={ev.songsCount ? "no repertório" : "a definir"} />
          </div>
          <TeamList slots={slots} showStatus={ev.status !== "draft"} showAdmin dense grouped />
        </>
      ) : (
        <>
          {focus.map(areaBlock)}
          <div className="px-4 py-3.5 sm:px-5">
            <h3 className="text-[13px] font-semibold">
              Repertório
              {setlist.length > 0 && (
                <span className="tabular ml-2 font-mono text-[12px] font-normal text-muted">
                  {setlist.length} {plural(setlist.length, "música", "músicas")}
                </span>
              )}
            </h3>
            {setlist.length === 0 ? (
              <p className="mt-1 text-[13px] text-muted">{canSetlist ? "Ainda não definido." : "Ainda não finalizado pela liderança vocal. Você pode começar a banda mesmo assim."}</p>
            ) : (
              <p className="mt-1 text-[13px] text-muted">
                {tonless > 0 ? <span className="text-warning">{tonless} {plural(tonless, "música ainda está sem tom definido", "músicas ainda estão sem tom definido")}. </span> : "Todas com tom definido. "}
                {ev.setlistUpdatedAt && (
                  <>
                    Atualizado {ago(ev.setlistUpdatedAt)}
                    {ev.setlistUpdatedBy ? ` por ${ev.setlistUpdatedBy}` : ""}.
                  </>
                )}
              </p>
            )}
            <div className="mt-2.5">
              <ButtonLink href={canSetlist ? `/eventos/${ev.id}/repertorio` : `/eventos/${ev.id}`} variant={canSetlist ? "secondary" : "ghost"} size="sm">
                {canSetlist ? "Preparar repertório" : "Ver repertório"}
              </ButtonLink>
            </div>
          </div>
        </>
      )}
      <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3 sm:px-5">
        {isAdmin && (
          <ButtonLink href={`/escalas?culto=${ev.id}`} size="sm">
            Revisar escala
          </ButtonLink>
        )}
        {isAdmin && (
          <ButtonLink href={`/eventos/${ev.id}/repertorio`} variant="secondary" size="sm">
            Repertório
          </ButtonLink>
        )}
        <ButtonLink href={`/eventos/${ev.id}`} variant="ghost" size="sm">
          Detalhes
        </ButtonLink>
      </div>
    </Card>
  );
}

async function MemberDashboard({ userId, orgId, today, name, note }: { userId: string | null; orgId: string; today: string; name: string; note: React.ReactNode }) {
  const [mine, upcoming] = await Promise.all([userId ? getParticipantSchedule(orgId, userId, today, "next", 10) : Promise.resolve([]), listEvents(orgId, today, addDays(today, 30))]);
  const visibleMine = mine.filter((m) => m.eventStatus === "pending" || m.eventStatus === "published");
  const visibleUpcoming = upcoming.filter((e) => e.status === "pending" || e.status === "published").slice(0, 5);
  const toAnswer = visibleMine.filter((m) => m.status === "pending").length;
  const [first, ...others] = visibleMine;
  const [firstSlots, firstSetlist] = first ? await Promise.all([getEventSlots(first.eventId), getSetlist(first.eventId)]) : [[], []];
  const nextService = upcoming.find((e) => e.type !== "ensaio" && e.status !== "cancelled");
  const nextRehearsal = upcoming.find((e) => e.type === "ensaio" && (e.status === "pending" || e.status === "published"));

  return (
    <>
      {note}
      <Greeting name={name} today={today} line={toAnswer ? `Você tem ${toAnswer} ${plural(toAnswer, "escala esperando confirmação", "escalas esperando confirmação")}.` : undefined} />

      {first ? (
        <Card as="section" aria-label="Sua próxima escala">
          <HeroBackdrop className="rounded-t-[calc(var(--radius-card)-1px)]">
            <Link href={`/eventos/${first.eventId}`} className="block px-4 pt-4 pb-5 sm:px-5">
              <p className="eyebrow text-[#f4a468]!">Sua próxima escala · {relativeDay(first.date, today)}</p>
              <div className="mt-3 flex items-end justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-[22px] leading-tight font-semibold text-balance">{first.title}</h2>
                  <p className="mt-1 text-[13.5px] text-white/75">
                    {weekdayName(first.date)}, {formatDayMonth(first.date)}
                    {first.location && <> · {first.location}</>}
                  </p>
                </div>
                <span className="tabular shrink-0 font-mono text-[40px] leading-none font-medium tracking-tight sm:text-[48px]">{first.startTime}</span>
              </div>
              <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1 text-[13px]">
                <span className="text-white/70">Você:</span>
                <span className="font-medium">{first.functionName}</span>
              </p>
            </Link>
          </HeroBackdrop>
          <div className="px-4 py-3 sm:px-5">
            {first.confirmDeadline && first.status === "pending" && <p className="mb-2 text-[13px] text-warning">Confirme até {formatDayMonth(first.confirmDeadline)}</p>}
            <SlotResponse slotId={first.slotId} status={first.status} />
          </div>
          {firstSetlist.length > 0 && (
            <div className="border-t border-border px-4 py-3 sm:px-5">
              <h3 className="mb-1.5 text-[13px] font-semibold">Repertório</h3>
              <ol className="divide-y divide-border">
                {firstSetlist.map((s, i) => (
                  <li key={s.id} className="flex items-baseline gap-3 py-1.5 text-[14px]">
                    <span className="tabular w-5 text-right font-mono text-[12px] text-subtle">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{s.title}</span>
                    <span className={cn("font-mono text-[13px]", s.key ?? s.originalKey ? "text-accent" : "text-muted")}>{s.key ?? s.originalKey ?? "—"}</span>
                  </li>
                ))}
              </ol>
              {nextRehearsal && (
                <p className="mt-2 text-[12.5px] text-muted">
                  Ensaio: {weekdayName(nextRehearsal.date)}, {formatDayMonth(nextRehearsal.date)} · <span className="font-mono">{nextRehearsal.startTime}</span>
                </p>
              )}
            </div>
          )}
          {firstSlots.length > 0 && (
            <details className="border-t border-border">
              <summary className="flex min-h-11 items-center px-4 text-[13px] font-medium text-fg-2 sm:px-5">Ver equipe completa</summary>
              <TeamList slots={firstSlots} dense grouped />
            </details>
          )}
        </Card>
      ) : (
        <Card>
          <EmptyState
            icon={<CalendarPlus />}
            title={nextService && nextService.status === "draft" ? "A escala deste culto ainda não foi publicada" : "Nenhuma escala publicada para você"}
            description={
              nextService && nextService.status === "draft"
                ? `${nextService.title} · ${weekdayName(nextService.date)}, ${formatDayMonth(nextService.date)} às ${nextService.startTime}. Assim que a liderança publicar, aparece aqui.`
                : "Quando a liderança publicar uma escala com seu nome, ela aparece aqui."
            }
            action={
              <ButtonLink href="/disponibilidade" variant="secondary">
                Informar indisponibilidade
              </ButtonLink>
            }
          />
        </Card>
      )}

      {others.length > 0 && (
        <Section title="Depois dessa" className="mt-8">
          <List>
            {others.map((m) => (
              <li key={m.slotId} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:px-4">
                <Link href={`/eventos/${m.eventId}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <DateBlock date={m.date} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-medium">{m.title}</span>
                    <span className="block text-[13px] text-muted">
                      <span className="font-mono text-[12.5px]">{m.startTime}</span> · {m.functionName}
                    </span>
                    {m.confirmDeadline && m.status === "pending" && <span className="block text-[12.5px] text-warning">Confirme até {formatDayMonth(m.confirmDeadline)}</span>}
                  </span>
                </Link>
                <div className="sm:shrink-0">
                  <SlotResponse slotId={m.slotId} status={m.status} compact />
                </div>
              </li>
            ))}
          </List>
        </Section>
      )}

      <Section title="Próximos compromissos" action={<Link href="/agenda" className="link-action">Agenda</Link>} className="mt-8">
        {visibleUpcoming.length ? (
          <List>
            {visibleUpcoming.map((e) => (
              <EventRow key={e.id} event={e} />
            ))}
          </List>
        ) : (
          <p className="text-[13.5px] text-muted">Nenhum compromisso publicado nos próximos 30 dias.</p>
        )}
      </Section>
    </>
  );
}

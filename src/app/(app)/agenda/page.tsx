import { CalendarPlus, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Card, EmptyState, List, PageHeader } from "@/components/ui/primitives";
import { addDays, addMonths, endOfMonth, formatDayMonth, formatMonthYear, monthKey, todayIn, weekday, WEEKDAY_SHORT_NAMES, weekdayName } from "@/domain/dates";
import { categoryDot, categoryLabel, categoryOf, type EventCategory, EventRow } from "@/features/events/event-ui";
import { cn } from "@/lib/cn";
import { isLeader } from "@/domain/permissions";
import { requireUser } from "@/server/auth/session";
import { listEvents, type EventListItem } from "@/server/queries/events";
import { plural } from "@/lib/plural";

export const metadata: Metadata = { title: "Agenda" };

const FILTERS = [
  { key: "todos", label: "Todos" },
  { key: "cultos", label: "Cultos" },
  { key: "ensaios", label: "Ensaios" },
  { key: "especiais", label: "Especiais" },
] as const;

const chip: Record<EventCategory, string> = {
  culto: "border-l-cat-culto",
  ensaio: "border-l-cat-ensaio",
  especial: "border-l-cat-especial",
};

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ mes?: string; tipo?: string; ver?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const today = todayIn();
  const month = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? sp.mes! : monthKey(today);
  const filter = FILTERS.some((f) => f.key === sp.tipo) ? sp.tipo! : "todos";
  const view = sp.ver === "lista" ? "lista" : "mes";
  const first = `${month}-01`;
  const last = endOfMonth(first);
  const isAdmin = user.role === "admin";
  const leader = isLeader(user);

  let events = await listEvents(user.organizationId, first, last, { includeCancelled: leader });
  if (!leader) events = events.filter((e) => e.status !== "draft");
  if (filter === "ensaios") events = events.filter((e) => categoryOf(e.type) === "ensaio");
  if (filter === "cultos") events = events.filter((e) => categoryOf(e.type) === "culto");
  if (filter === "especiais") events = events.filter((e) => categoryOf(e.type) === "especial");

  const prev = monthKey(addMonths(first, -1));
  const next = monthKey(addMonths(first, 1));
  const qs = (o: { m?: string; t?: string; v?: string }) => {
    const p = new URLSearchParams();
    p.set("mes", o.m ?? month);
    const t = o.t ?? filter;
    if (t !== "todos") p.set("tipo", t);
    const v = o.v ?? view;
    if (v !== "mes") p.set("ver", v);
    return `/agenda?${p.toString()}`;
  };
  const byDate = new Map<string, EventListItem[]>();
  for (const e of events) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);

  return (
    <>
      <PageHeader
        title="Agenda"
        actions={
          isAdmin && (
            <ButtonLink href="/eventos/novo" size="sm" icon={<Plus className="h-4 w-4" aria-hidden />}>
              Novo evento
            </ButtonLink>
          )
        }
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1">
          <Link href={qs({ m: prev })} className="grid h-11 w-11 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg sm:h-9 sm:w-9" aria-label="Mês anterior">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <h2 className="min-w-40 text-center text-[16px] font-semibold first-letter:uppercase">{formatMonthYear(month)}</h2>
          <Link href={qs({ m: next })} className="grid h-11 w-11 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg sm:h-9 sm:w-9" aria-label="Próximo mês">
            <ChevronRight className="h-4 w-4" />
          </Link>
          {month !== monthKey(today) && (
            <Link href={qs({ m: monthKey(today) })} className="link-action ml-2">
              Hoje
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2 overflow-x-auto">
          <div role="tablist" aria-label="Filtrar por tipo" className="flex gap-1">
            {FILTERS.map((f) => (
              <Link
                key={f.key}
                href={qs({ t: f.key })}
                role="tab"
                aria-selected={filter === f.key}
                className={cn("flex h-10 shrink-0 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium sm:h-8 sm:px-2.5", filter === f.key ? "bg-surface-3 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg")}
              >
                {f.key !== "todos" && <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", categoryDot[f.key === "cultos" ? "culto" : f.key === "ensaios" ? "ensaio" : "especial"])} />}
                {f.label}
              </Link>
            ))}
          </div>
          <div role="radiogroup" aria-label="Visualização" className="ml-auto inline-flex shrink-0 rounded-lg bg-surface-2 p-0.5">
            {(["mes", "lista"] as const).map((v) => (
              <Link
                key={v}
                href={qs({ v })}
                role="radio"
                aria-checked={view === v}
                className={cn("flex h-9 items-center rounded-md px-3.5 text-[13px] font-medium sm:h-7 sm:px-3", view === v ? "bg-surface text-fg shadow-[0_1px_2px_rgb(0_0_0/0.08)]" : "text-muted hover:text-fg")}
              >
                {v === "mes" ? "Mês" : "Lista"}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {view === "mes" && <MonthGrid month={month} today={today} byDate={byDate} />}

      <div className={cn(view === "mes" && "mt-6 lg:hidden")}>
        {events.length === 0 ? (
          <Card>
            <EmptyState
              icon={<CalendarPlus />}
              title="Nenhum compromisso neste mês"
              description={isAdmin ? "Crie um evento avulso. Os cultos de domingo são gerados automaticamente." : "Quando a liderança publicar compromissos, eles aparecem aqui."}
              action={isAdmin && <ButtonLink href="/eventos/novo">Novo evento</ButtonLink>}
            />
          </Card>
        ) : (
          <div className="flex flex-col gap-5">
            {[...byDate.entries()].map(([date, list]) => (
              <section key={date} id={`d-${date}`} aria-label={`${weekdayName(date)} ${formatDayMonth(date)}`} className="scroll-mt-6">
                <h3 className={cn("mb-1.5 text-[12.5px] font-medium", date === today ? "text-accent" : "text-muted")}>
                  {date === today ? "Hoje · " : ""}
                  {weekdayName(date)}, <span className="font-mono">{formatDayMonth(date)}</span>
                </h3>
                <List>
                  {list.map((e) => (
                    <EventRow key={e.id} event={e} showAdmin={leader} />
                  ))}
                </List>
              </section>
            ))}
          </div>
        )}
      </div>

      <p className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
        {(Object.keys(categoryLabel) as EventCategory[]).map((c) => (
          <span key={c} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={cn("h-2 w-2 rounded-full", categoryDot[c])} />
            {categoryLabel[c]}
          </span>
        ))}
      </p>
    </>
  );
}

function MonthGrid({ month, today, byDate }: { month: string; today: string; byDate: Map<string, EventListItem[]> }) {
  const first = `${month}-01`;
  const start = addDays(first, -weekday(first));
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const rows = cells[35].slice(0, 7) !== month ? 5 : 6;
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAY_SHORT_NAMES.map((d) => (
          <div key={d} className="py-2 text-center text-[11px] font-medium text-muted uppercase">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.slice(0, rows * 7).map((d) => {
          const inMonth = d.slice(0, 7) === month;
          const list = byDate.get(d) ?? [];
          const isToday = d === today;
          return (
            <div key={d} className={cn("min-h-14 border-r border-b border-border p-1 [&:nth-child(7n)]:border-r-0 lg:min-h-[104px] lg:p-1.5", !inMonth && "bg-surface-2/50")}>
              {/* Celular: número + pontos; toque leva ao dia na lista abaixo. */}
              <a href={list.length ? `#d-${d}` : undefined} className="flex flex-col items-center gap-1 lg:hidden" aria-label={list.length ? `${list.length} ${plural(list.length, "compromisso", "compromissos")} em ${formatDayMonth(d)}` : undefined}>
                <span className={cn("tabular grid h-6 w-6 place-items-center rounded-full font-mono text-[12px]", isToday ? "bg-accent text-white" : inMonth ? "text-fg-2" : "text-subtle")}>{Number(d.slice(8))}</span>
                <span className="flex gap-0.5">
                  {list.slice(0, 3).map((e) => (
                    <span key={e.id} aria-hidden className={cn("h-1.5 w-1.5 rounded-full", categoryDot[categoryOf(e.type)], e.status === "cancelled" && "opacity-30")} />
                  ))}
                </span>
              </a>
              {/* Desktop: rótulos com a cor da categoria. */}
              <div className="hidden lg:block">
                <span className={cn("tabular inline-grid h-6 min-w-6 place-items-center rounded-full px-1 font-mono text-[12px]", isToday ? "bg-accent text-white" : inMonth ? "text-fg-2" : "text-subtle")}>{Number(d.slice(8))}</span>
                <div className="mt-1 flex flex-col gap-0.5">
                  {list.slice(0, 3).map((e) => (
                    <Link
                      key={e.id}
                      href={`/eventos/${e.id}`}
                      className={cn(
                        "block min-h-6 truncate rounded-[4px] border-l-2 bg-surface-2/70 px-1.5 py-1 text-[12px] hover:bg-surface-3",
                        chip[categoryOf(e.type)],
                        e.status === "cancelled" && "text-muted line-through",
                        e.status === "draft" && "text-fg-2 italic",
                      )}
                      title={`${e.startTime} ${e.title}`}
                    >
                      <span className="font-mono text-[11px] text-muted">{e.startTime}</span> {e.title}
                    </Link>
                  ))}
                  {list.length > 3 && <span className="px-1.5 text-[11.5px] text-muted">+{list.length - 3}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

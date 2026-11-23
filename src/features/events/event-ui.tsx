import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { monthDay, weekdayShort } from "@/domain/dates";
import { cn } from "@/lib/cn";
import { EVENT_STATUS_LABELS, EVENT_TYPE_LABELS } from "@/lib/validation";
import type { EventListItem } from "@/server/queries/events";
import { Badge, type Tone } from "@/components/ui/primitives";

export const statusTone: Record<string, Tone> = { draft: "neutral", pending: "warning", published: "success", completed: "info", cancelled: "danger" };

export type EventCategory = "culto" | "ensaio" | "especial";

/** Três categorias visuais: culto regular, ensaio e o resto (eventos, conferências, cultos especiais). */
export function categoryOf(type: string): EventCategory {
  if (type === "culto") return "culto";
  if (type === "ensaio") return "ensaio";
  return "especial";
}
export const categoryLabel: Record<EventCategory, string> = { culto: "Culto", ensaio: "Ensaio", especial: "Especial" };
export const categoryDot: Record<EventCategory, string> = { culto: "bg-cat-culto", ensaio: "bg-cat-ensaio", especial: "bg-cat-especial" };
export const categoryBar: Record<EventCategory, string> = { culto: "border-l-cat-culto", ensaio: "border-l-cat-ensaio", especial: "border-l-cat-especial" };

export function CategoryDot({ type, className }: { type: string; className?: string }) {
  return <span aria-hidden className={cn("inline-block h-2 w-2 shrink-0 rounded-full", categoryDot[categoryOf(type)], className)} />;
}

export function EventStatusBadge({ status }: { status: keyof typeof EVENT_STATUS_LABELS }) {
  return <Badge tone={statusTone[status]}>{EVENT_STATUS_LABELS[status]}</Badge>;
}

/** Data compacta em coluna: dia da semana, número em mono, mês. */
export function DateBlock({ date, size = "md", muted, onDark }: { date: string; size?: "md" | "lg"; muted?: boolean; /** Sobre fundo escuro (destaque com foto): texto claro nos dois temas. */ onDark?: boolean }) {
  const { day, month } = monthDay(date);
  return (
    <div className={cn("flex shrink-0 flex-col items-center justify-center leading-none", size === "lg" ? "w-14" : "w-11", onDark ? "text-white" : muted ? "text-subtle" : "text-fg")} aria-hidden>
      <span className={cn("text-[10.5px] font-medium tracking-wide uppercase", onDark ? "text-white/70" : "text-muted")}>{weekdayShort(date)}</span>
      <span className={cn("tabular mt-1 font-mono font-medium tracking-tight", size === "lg" ? "text-[28px]" : "text-[20px]")}>{day}</span>
      <span className={cn("mt-1 text-[10.5px] font-medium tracking-wide uppercase", onDark ? "text-white/70" : "text-muted")}>{month}</span>
    </div>
  );
}

export function EventTypeLabel({ type }: { type: keyof typeof EVENT_TYPE_LABELS }) {
  return <span>{EVENT_TYPE_LABELS[type]}</span>;
}

/**
 * Linha de compromisso para uso dentro de <List>: data · categoria · título · meta.
 * Sem sombra nem cartão próprio — a lista dá a estrutura.
 */
export function EventRow({ event, showAdmin, href }: { event: EventListItem; showAdmin?: boolean; href?: string }) {
  const cancelled = event.status === "cancelled";
  const missing = event.slotsTotal - event.slotsFilled;
  return (
    <li>
      <Link href={href ?? `/eventos/${event.id}`} className={cn("group flex items-center gap-3 px-3 py-3 transition-colors hover:bg-surface-2/60 sm:px-4", cancelled && "opacity-60")}>
        <DateBlock date={event.date} muted={cancelled || event.status === "completed"} />
        <span aria-hidden className={cn("h-8 w-[3px] shrink-0 rounded-full", categoryDot[categoryOf(event.type)])} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className={cn("truncate text-[14.5px] font-medium", cancelled && "line-through")}>{event.title}</h3>
            {(showAdmin || cancelled) && event.status !== "published" && <EventStatusBadge status={event.status} />}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-muted">
            <span className="tabular font-mono text-[12.5px]">
              {event.startTime}
              {event.endTime ? `–${event.endTime}` : ""}
            </span>
            {event.minister && (
              <>
                <span aria-hidden className="text-subtle">·</span>
                <span className="truncate">{event.minister}</span>
              </>
            )}
            {event.location && (
              <span className="hidden truncate sm:inline">
                <span aria-hidden className="mr-2 text-subtle">·</span>
                {event.location}
              </span>
            )}
          </p>
        </div>
        {showAdmin && event.slotsTotal > 0 && !cancelled && event.type !== "ensaio" && (
          <div className="hidden shrink-0 flex-col items-end gap-0.5 sm:flex">
            <span className={cn("tabular font-mono text-[12.5px]", missing > 0 ? "text-warning" : "text-muted")}>
              {event.slotsFilled}/{event.slotsTotal}
            </span>
            {event.declined > 0 ? <Badge tone="danger">{event.declined} recusa</Badge> : <span className="text-[11.5px] text-subtle">equipe</span>}
          </div>
        )}
        <ChevronRight className="h-4 w-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </li>
  );
}

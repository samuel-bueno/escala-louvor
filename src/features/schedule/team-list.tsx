import { Lock } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { AREA_LABELS, areaOfKind, type Area } from "@/domain/permissions";
import { cn } from "@/lib/cn";
import type { SlotRow } from "@/server/queries/events";
import { ConfirmationStatus } from "./confirmation-status";

const kindOrder: Record<string, number> = { minister: 0, vocal: 1, instrument: 2, tech: 3 };

export function sortSlots<T extends Pick<SlotRow, "functionKind" | "sortOrder">>(slots: T[]) {
  return [...slots].sort((a, b) => (kindOrder[a.functionKind] ?? 9) - (kindOrder[b.functionKind] ?? 9) || a.sortOrder - b.sortOrder);
}

const AREAS: Area[] = ["vocal", "instrumental", "other"];

function Row({ s, showStatus, showAdmin, showReason, dense }: { s: SlotRow; showStatus?: boolean; showAdmin?: boolean; showReason?: boolean; dense?: boolean }) {
  return (
    <li className={cn("grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-3 px-4 sm:grid-cols-[10rem_1fr_auto] sm:px-5", dense ? "py-2" : "py-2.5")}>
      <span className="truncate text-[13px] text-muted">{s.functionName}</span>
      <span className="flex min-w-0 items-center gap-2">
        {s.participantName ? (
          <>
            <Avatar name={s.participantName} size={22} />
            <span className="truncate text-[14px] font-medium">{s.participantName}</span>
            {s.locked && showAdmin && <Lock className="h-3 w-3 shrink-0 text-subtle" aria-label="Fixado" />}
          </>
        ) : s.guestName ? (
          <>
            <Avatar name={s.guestName} size={22} />
            <span className="truncate text-[14px] font-medium">{s.guestName}</span>
            <span className="shrink-0 text-[12px] text-muted">convidado</span>
          </>
        ) : (
          <>
            <span aria-hidden className="h-[22px] w-[22px] shrink-0 rounded-full border border-dashed border-border-strong" />
            <span className="text-[14px] text-warning">Vaga em aberto</span>
          </>
        )}
      </span>
      <span className="flex justify-end">{s.participantId && showStatus && <ConfirmationStatus status={s.status} />}</span>
      {showAdmin && s.status === "declined" && s.swapSuggestedName && (
        <span className="col-span-3 -mt-1 text-[12.5px] text-muted sm:col-start-2 sm:col-end-4">
          Sugeriu <span className="font-medium text-fg-2">{s.swapSuggestedName}</span> para o lugar.
        </span>
      )}
      {(s.notes || (showReason && s.status === "declined" && s.declineReason)) && (
        <span className="col-span-3 -mt-1 text-[12.5px] text-muted sm:col-start-2 sm:col-end-4">
          {s.notes}
          {showReason && s.status === "declined" && s.declineReason && <span className="text-danger"> Motivo da recusa: {s.declineReason}</span>}
        </span>
      )}
    </li>
  );
}

/**
 * Equipe de um compromisso. Com `grouped`, separa claramente Vocais × Instrumental × Técnica.
 * `only` mostra uma área específica (ex.: painel da liderança dos vocais).
 */
export function TeamList({ slots, showStatus, showAdmin, showReason = showAdmin, dense, grouped, only }: { slots: SlotRow[]; showStatus?: boolean; showAdmin?: boolean; /** Motivo escrito da recusa: só quem administra (menor privilégio). */ showReason?: boolean; dense?: boolean; grouped?: boolean; only?: Area }) {
  const sorted = sortSlots(slots).filter((s) => !only || areaOfKind(s.functionKind) === only);
  if (!grouped)
    return (
      <ul className="divide-y divide-border">
        {sorted.map((s) => (
          <Row key={s.id} s={s} showStatus={showStatus} showAdmin={showAdmin} showReason={showReason} dense={dense} />
        ))}
      </ul>
    );
  return (
    <div>
      {AREAS.map((area) => {
        const list = sorted.filter((s) => areaOfKind(s.functionKind) === area);
        if (!list.length) return null;
        const filled = list.filter((s) => s.participantId || s.guestName).length;
        return (
          <section key={area} aria-label={AREA_LABELS[area]} className="border-t border-border first:border-t-0">
            <h3 className="flex items-baseline justify-between bg-surface-2/50 px-4 py-1.5 text-[11.5px] font-medium text-muted sm:px-5">
              <span>{AREA_LABELS[area]}</span>
              <span className="tabular font-mono">
                {filled}/{list.length}
              </span>
            </h3>
            <ul className="divide-y divide-border">
              {list.map((s) => (
                <Row key={s.id} s={s} showStatus={showStatus} showAdmin={showAdmin} showReason={showReason} dense={dense} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

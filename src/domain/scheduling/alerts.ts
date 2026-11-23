/**
 * Alertas da escala (montagem manual ou revisão da prévia).
 *
 * Severidades:
 *  - error   → bloqueia a publicação (ex.: instrumento incompatível, conflito simultâneo).
 *  - warning → o administrador pode ignorar conscientemente.
 *  - info    → apenas informativo.
 */
import { diffDays, formatDayMonth, monthKey, timesOverlap } from "../dates";
import { isUnavailableOn, monthlyLimitOf } from "./generate";
import type { Assignment, DistributionRules, SchedEvent, SchedParticipant } from "./types";
import { plural } from "@/lib/plural";

export type AlertSeverity = "info" | "warning" | "error";

export interface ScheduleAlert {
  severity: AlertSeverity;
  slotId: string | null;
  participantId: string | null;
  code:
    | "incompatible"
    | "inactive"
    | "unavailable"
    | "time-conflict"
    | "duplicate-in-event"
    | "monthly-limit"
    | "consecutive"
    | "overload"
    | "required-empty"
    | "declined"
    | "unknown-participant";
  message: string;
}

export interface SlotState {
  id: string;
  functionId: string;
  participantId: string | null;
  /** Convidado de fora: vaga preenchida, sem regras de disponibilidade/limite. */
  guestName?: string | null;
  required?: boolean;
  status?: "pending" | "confirmed" | "declined";
}

export function computeAlerts(
  event: Pick<SchedEvent, "id" | "title" | "date" | "startTime" | "endTime">,
  slots: SlotState[],
  participants: SchedParticipant[],
  otherAssignments: Assignment[],
  rules: DistributionRules,
  functionNames: Record<string, string> = {},
): ScheduleAlert[] {
  const alerts: ScheduleAlert[] = [];
  const byId = new Map(participants.map((p) => [p.id, p]));
  const fn = (id: string) => functionNames[id] ?? "Função";
  const others = otherAssignments.filter((a) => a.eventId !== event.id);
  const seen = new Map<string, string>();

  for (const slot of slots) {
    if (!slot.participantId && slot.guestName) continue;
    if (!slot.participantId) {
      if (slot.required !== false)
        alerts.push({ severity: "warning", slotId: slot.id, participantId: null, code: "required-empty", message: `${fn(slot.functionId)}: posição obrigatória vazia.` });
      continue;
    }
    const p = byId.get(slot.participantId);
    if (!p) {
      alerts.push({ severity: "error", slotId: slot.id, participantId: slot.participantId, code: "unknown-participant", message: "Participante não encontrado." });
      continue;
    }
    const base = { slotId: slot.id, participantId: p.id };
    if (!p.functionIds.includes(slot.functionId))
      alerts.push({ ...base, severity: "error", code: "incompatible", message: `${p.name} não tem ${fn(slot.functionId)} cadastrado.` });
    if (!p.active) alerts.push({ ...base, severity: "error", code: "inactive", message: `${p.name} está inativo(a).` });
    if (isUnavailableOn(p, event.date))
      alerts.push({ ...base, severity: "warning", code: "unavailable", message: `${p.name} informou indisponibilidade em ${formatDayMonth(event.date)}.` });
    if (slot.status === "declined")
      alerts.push({ ...base, severity: "warning", code: "declined", message: `${p.name} recusou — ${fn(slot.functionId)} precisa de substituição.` });

    const prevFn = seen.get(p.id);
    if (prevFn)
      alerts.push({ ...base, severity: "warning", code: "duplicate-in-event", message: `${p.name} já está como ${fn(prevFn)} neste compromisso.` });
    else seen.set(p.id, slot.functionId);

    const clash = others.find((a) => a.participantId === p.id && a.date === event.date && timesOverlap(a.startTime, a.endTime, event.startTime, event.endTime));
    if (clash)
      alerts.push({ ...base, severity: "error", code: "time-conflict", message: `${p.name} está escalado(a) em "${clash.eventTitle}" no mesmo horário.` });

    const month = monthKey(event.date);
    const monthEvents = new Set(others.filter((a) => a.participantId === p.id && monthKey(a.date) === month).map((a) => a.eventId));
    const limit = monthlyLimitOf(p, rules);
    if (monthEvents.size >= limit)
      alerts.push({
        ...base,
        severity: rules.limitMode === "hard" ? "warning" : "info",
        code: "monthly-limit",
        message: `${p.name} já tem ${monthEvents.size} ${plural(monthEvents.size, "escala", "escalas")} no mês (limite ${limit}).`,
      });
    else if (monthEvents.size >= limit - 1 && limit > 1)
      alerts.push({ ...base, severity: "info", code: "overload", message: `${p.name} atingirá o limite mensal (${monthEvents.size + 1}/${limit}).` });

    const close = others.filter((a) => a.participantId === p.id && Math.abs(diffDays(a.date, event.date)) < rules.minIntervalDays && a.date !== event.date);
    if (rules.avoidConsecutive && close.length > 0)
      alerts.push({
        ...base,
        severity: "info",
        code: "consecutive",
        message: `${p.name} também serve em ${formatDayMonth(close[0].date)} (intervalo menor que ${rules.minIntervalDays} dias).`,
      });
  }
  return alerts;
}

export function hasBlockingErrors(alerts: ScheduleAlert[]): boolean {
  return alerts.some((a) => a.severity === "error");
}

/** Resumos mostram cada problema uma única vez (a mesma pessoa em duas posições gera o mesmo aviso duas vezes). */
export function dedupeAlerts(alerts: ScheduleAlert[]): ScheduleAlert[] {
  const seen = new Set<string>();
  return alerts.filter((a) => {
    const k = `${a.severity}|${a.code}|${a.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

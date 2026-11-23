/**
 * Situação de cada pessoa para uma posição — usado nos seletores da escala
 * manual para mostrar "por que" alguém tem alerta antes de escolher.
 */
import { monthKey, timesOverlap } from "../dates";
import { isUnavailableOn, monthlyLimitOf } from "./generate";
import type { Assignment, DistributionRules, SchedParticipant } from "./types";

export interface CandidateInfo {
  id: string;
  name: string;
  /** Tem a função cadastrada (só estes aparecem como opção). */
  compatible: boolean;
  monthCount: number;
  issues: string[];
}

export function describeCandidates(
  people: SchedParticipant[],
  functionId: string,
  event: { id: string; date: string; startTime: string; endTime?: string | null },
  others: Assignment[],
  rules: DistributionRules,
  takenInEvent: Set<string>,
): CandidateInfo[] {
  const month = monthKey(event.date);
  return people
    .filter((p) => p.active)
    .map((p) => {
      const issues: string[] = [];
      if (isUnavailableOn(p, event.date)) issues.push("indisponível");
      if (takenInEvent.has(p.id)) issues.push("já escalado neste culto");
      const clash = others.find((a) => a.participantId === p.id && a.eventId !== event.id && a.date === event.date && timesOverlap(a.startTime, a.endTime, event.startTime, event.endTime));
      if (clash) issues.push(`conflito com ${clash.eventTitle}`);
      const monthCount = new Set(others.filter((a) => a.participantId === p.id && a.eventId !== event.id && monthKey(a.date) === month).map((a) => a.eventId)).size;
      const limit = monthlyLimitOf(p, rules);
      if (monthCount >= limit) issues.push(`limite mensal (${monthCount}/${limit})`);
      return { id: p.id, name: p.name, compatible: p.functionIds.includes(functionId), monthCount, issues };
    })
    .sort((a, b) => a.issues.length - b.issues.length || a.monthCount - b.monthCount || a.name.localeCompare(b.name, "pt-BR"));
}

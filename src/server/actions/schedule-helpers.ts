import "server-only";
import { computeAlerts } from "@/domain/scheduling/alerts";
import { functionNameMap, getRules } from "../queries/core";
import { getEventSlots, historyWindow, loadAssignments } from "../queries/events";
import { loadSchedParticipants } from "../queries/participants";

/** Alertas de um evento com base no estado salvo no banco. */
export async function computeEventAlerts(orgId: string, ev: { id: string; title: string; date: string; startTime: string; endTime: string | null }) {
  const win = historyWindow(ev.date, ev.date);
  const [slots, people, others, rules, names] = await Promise.all([
    getEventSlots(ev.id),
    loadSchedParticipants(orgId, ev.date, ev.date),
    loadAssignments(orgId, win.from, win.to, [ev.id]),
    getRules(orgId),
    functionNameMap(orgId),
  ]);
  return computeAlerts(ev, slots, people, others, rules, names);
}

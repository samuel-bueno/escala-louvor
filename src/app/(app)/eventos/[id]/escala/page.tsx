import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/layout/back-link";
import { PageHeader } from "@/components/ui/primitives";
import { formatDate, weekdayName } from "@/domain/dates";
import { ScheduleEditor } from "@/features/schedule/schedule-editor";
import { areasEditable } from "@/domain/permissions";
import { requireLeaderPage } from "@/server/auth/session";
import { getFunctions, getRules } from "@/server/queries/core";
import { getEvent, getEventSlots, historyWindow, loadAssignments } from "@/server/queries/events";
import { loadSchedParticipants } from "@/server/queries/participants";

export const metadata: Metadata = { title: "Escala" };

export default async function SchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireLeaderPage();
  const { id } = await params;
  const ev = await getEvent(user.organizationId, id);
  if (!ev) notFound();
  const win = historyWindow(ev.date, ev.date);
  const [functions, slots, people, others, rules] = await Promise.all([
    getFunctions(user.organizationId, true),
    getEventSlots(id),
    loadSchedParticipants(user.organizationId, ev.date, ev.date),
    loadAssignments(user.organizationId, win.from, win.to, [id]),
    getRules(user.organizationId),
  ]);
  // Versão dos dados: quando muda (após salvar/gerar), o editor é recriado do zero.
  const version = slots.map((s) => `${s.id}:${s.participantId}:${s.guestName}:${s.locked}:${s.status}:${s.functionId}`).join("|") + `|${ev.scheduleLocked}`;
  return (
    <>
      <PageHeader back={<BackLink href={`/eventos/${id}`} label={ev.title} />} title="Escala" subtitle={`${ev.title} · ${weekdayName(ev.date)}, ${formatDate(ev.date)} · ${ev.startTime}`} />
      <ScheduleEditor
        key={version}
        event={{ id: ev.id, title: ev.title, date: ev.date, startTime: ev.startTime, endTime: ev.endTime, status: ev.status }}
        functions={functions.filter((f) => f.active || slots.some((s) => s.functionId === f.id)).map((f) => ({ id: f.id, name: f.name, kind: f.kind }))}
        people={people}
        others={others}
        rules={rules}
        scheduleLocked={ev.scheduleLocked}
        readOnly={ev.status === "cancelled" || ev.status === "completed"}
        editableAreas={areasEditable(user)}
        isAdmin={user.role === "admin"}
        initialSlots={slots.map((s) => ({ id: s.id, functionId: s.functionId, participantId: s.participantId, guestName: s.guestName, locked: s.locked, required: s.required, notes: s.notes, status: s.status }))}
      />
    </>
  );
}

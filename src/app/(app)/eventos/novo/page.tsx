import type { Metadata } from "next";
import { BackLink } from "@/components/layout/back-link";
import { PageHeader } from "@/components/ui/primitives";
import { addDays, isValidDate, todayIn, weekday } from "@/domain/dates";
import { EventForm } from "@/features/events/event-form";
import { requireAdminPage } from "@/server/auth/session";
import { getFunctions, getSettings } from "@/server/queries/core";
import { listEvents } from "@/server/queries/events";

export const metadata: Metadata = { title: "Novo evento" };

export default async function NewEventPage({ searchParams }: { searchParams: Promise<{ data?: string }> }) {
  const user = await requireAdminPage();
  const sp = await searchParams;
  const today = todayIn();
  const [functions, settings, rehearsals] = await Promise.all([getFunctions(user.organizationId), getSettings(user.organizationId), listEvents(user.organizationId, today, addDays(today, 180), { types: ["ensaio"] })]);
  // Domingos já existem pela série automática: o padrão aqui é o próximo dia útil livre (quarta).
  const nextWednesday = addDays(today, (3 - weekday(today) + 7) % 7 || 7);
  const date = sp.data && isValidDate(sp.data) ? sp.data : nextWednesday;
  return (
    <>
      <PageHeader back={<BackLink href="/agenda" label="Agenda" />} title="Novo evento" subtitle="Culto especial, ensaio, vigília, conferência — em qualquer dia." />
      <EventForm
        functions={functions.map((f) => ({ id: f.id, name: f.name, kind: f.kind }))}
        defaultPositions={settings.defaultPositions}
        rehearsals={rehearsals.map((r) => ({ id: r.id, title: r.title, date: r.date, startTime: r.startTime }))}
        initial={{ title: "", type: "culto_especial", date, startTime: "20:00", endTime: null, location: "", theme: "", notes: "", confirmDeadline: null }}
      />
    </>
  );
}

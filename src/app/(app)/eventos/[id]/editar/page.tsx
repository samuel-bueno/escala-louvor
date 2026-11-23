import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/layout/back-link";
import { PageHeader } from "@/components/ui/primitives";
import { EventForm } from "@/features/events/event-form";
import { requireAdminPage } from "@/server/auth/session";
import { getFunctions } from "@/server/queries/core";
import { addDays } from "@/domain/dates";
import { getEvent, listEvents } from "@/server/queries/events";

export const metadata: Metadata = { title: "Editar compromisso" };

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminPage();
  const { id } = await params;
  const [ev, functions] = await Promise.all([getEvent(user.organizationId, id), getFunctions(user.organizationId)]);
  if (!ev) notFound();
  const rehearsals = (await listEvents(user.organizationId, addDays(ev.date, -30), addDays(ev.date, 30), { types: ["ensaio"] })).filter((r) => r.id !== ev.id);
  return (
    <>
      <PageHeader back={<BackLink href={`/eventos/${id}`} label={ev.title} />} title="Editar evento" subtitle="Equipe e pessoas são editadas na tela da escala." />
      <EventForm
        functions={functions}
        defaultPositions={[]}
        initial={ev}
        rehearsals={rehearsals.map((r) => ({ id: r.id, title: r.title, date: r.date, startTime: r.startTime }))}
        seriesNote={ev.recurrenceId ? "Este evento faz parte de uma série. As alterações valem só para esta data; o horário padrão da série fica em Configurações." : null}
      />
    </>
  );
}

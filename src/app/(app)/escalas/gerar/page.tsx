import type { Metadata } from "next";
import { BackLink } from "@/components/layout/back-link";
import { PageHeader } from "@/components/ui/primitives";
import { addDays, todayIn } from "@/domain/dates";
import { BatchGenerator } from "@/features/schedule/batch-generator";
import { requireAdminPage } from "@/server/auth/session";
import { listEvents } from "@/server/queries/events";
import { listParticipants } from "@/server/queries/participants";

export const metadata: Metadata = { title: "Gerar escalas" };

export default async function BatchGeneratePage() {
  const user = await requireAdminPage();
  const today = todayIn();
  const [events, people] = await Promise.all([listEvents(user.organizationId, today, addDays(today, 400)), listParticipants(user.organizationId, today)]);
  const open = events.filter((e) => e.status !== "completed" && e.status !== "cancelled");
  return (
    <>
      <PageHeader back={<BackLink href="/escalas" label="Escalas" />} title="Gerar várias escalas" subtitle="Distribuição equilibrada para um período inteiro. Você revisa tudo antes de salvar." />
      <BatchGenerator
        today={today}
        events={open.map((e) => ({ id: e.id, title: e.title, date: e.date, type: e.type, slotsTotal: e.slotsTotal, slotsFilled: e.slotsFilled, minister: e.minister }))}
        people={people.filter((p) => p.functions.length > 0).map((p) => ({ id: p.id, name: p.displayName, isMinister: p.functions.some((f) => f.kind === "minister") }))}
      />
    </>
  );
}

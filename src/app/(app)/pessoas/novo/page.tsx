import type { Metadata } from "next";
import { BackLink } from "@/components/layout/back-link";
import { PageHeader } from "@/components/ui/primitives";
import { ParticipantForm } from "@/features/people/participant-form";
import { requireAdminPage } from "@/server/auth/session";
import { getFunctions, getSettings } from "@/server/queries/core";

export const metadata: Metadata = { title: "Adicionar pessoa" };

export default async function NewParticipantPage() {
  const user = await requireAdminPage();
  const [functions, settings] = await Promise.all([getFunctions(user.organizationId), getSettings(user.organizationId)]);
  return (
    <>
      <PageHeader back={<BackLink href="/pessoas" label="Pessoas" />} title="Adicionar pessoa" subtitle="Colete só o necessário: nome e funções já bastam para escalar." />
      <ParticipantForm
        functions={functions}
        defaultLimit={settings.defaultMonthlyLimit}
        initial={{ fullName: "", displayName: "", email: null, phone: null, level: null, monthlyLimit: null, notes: null, active: true, usualDays: [], functionIds: [], primaryFunctionId: null, account: null }}
      />
    </>
  );
}

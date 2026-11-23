import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/layout/back-link";
import { PageHeader } from "@/components/ui/primitives";
import { ParticipantForm } from "@/features/people/participant-form";
import { requireAdminPage } from "@/server/auth/session";
import { getFunctions, getSettings } from "@/server/queries/core";
import { getParticipant } from "@/server/queries/participants";

export const metadata: Metadata = { title: "Editar pessoa" };

export default async function EditParticipantPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminPage();
  const { id } = await params;
  const [p, functions, settings] = await Promise.all([getParticipant(user.organizationId, id), getFunctions(user.organizationId, true), getSettings(user.organizationId)]);
  if (!p) notFound();
  return (
    <>
      <PageHeader back={<BackLink href={`/pessoas/${id}`} label={p.displayName} />} title={`Editar ${p.displayName}`} />
      <ParticipantForm
        functions={functions.filter((f) => f.active || p.functions.some((x) => x.functionId === f.id))}
        defaultLimit={settings.defaultMonthlyLimit}
        initial={{
          id: p.id,
          fullName: p.fullName,
          displayName: p.displayName,
          email: p.email,
          phone: p.phone,
          level: p.level,
          monthlyLimit: p.monthlyLimit,
          notes: p.notes,
          active: p.active,
          usualDays: p.usualDays,
          functionIds: p.functions.map((f) => f.functionId),
          primaryFunctionId: p.functions.find((f) => f.isPrimary)?.functionId ?? null,
          account: p.account
            ? {
                email: p.account.email,
                role: p.account.role === "admin" ? "admin" : p.account.leadsInstrumental && p.account.leadsVocal ? "lead_both" : p.account.leadsInstrumental ? "lead_instrumental" : p.account.leadsVocal ? "lead_vocal" : "member",
              }
            : null,
        }}
      />
    </>
  );
}

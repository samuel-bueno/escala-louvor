import { Check, UserCheck, X } from "lucide-react";
import type { Metadata } from "next";
import { and, asc, desc, eq, gt, isNull } from "drizzle-orm";
import { BackLink } from "@/components/layout/back-link";
import { ActionButton } from "@/components/ui/action-button";
import { Avatar } from "@/components/ui/avatar";
import { Badge, Card, EmptyState, PageHeader, Section } from "@/components/ui/primitives";
import { formatInstant } from "@/domain/dates";
import { InviteLinks } from "@/features/people/invite-links";
import { approveRegistrationAction, rejectRegistrationAction } from "@/server/actions/invites";
import { requireAdminPage } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { functions, invites, registrations } from "@/server/db/schema";

export const metadata: Metadata = { title: "Convites e solicitações" };

export default async function RegistrationsPage() {
  const user = await requireAdminPage();
  const orgId = user.organizationId;
  const [regs, activeInvites, fns] = await Promise.all([
    db.select().from(registrations).where(eq(registrations.organizationId, orgId)).orderBy(asc(registrations.createdAt)),
    db
      .select()
      .from(invites)
      .where(and(eq(invites.organizationId, orgId), isNull(invites.revokedAt), gt(invites.expiresAt, new Date())))
      .orderBy(desc(invites.createdAt)),
    db.select({ id: functions.id, name: functions.name }).from(functions).where(eq(functions.organizationId, orgId)),
  ]);
  const fnName = new Map(fns.map((f) => [f.id, f.name]));

  return (
    <>
      <PageHeader back={<BackLink href="/pessoas" label="Pessoas" />} title="Convites e solicitações" subtitle="Quem se cadastra pelo link aparece aqui para você aprovar." />
      <div className="flex flex-col gap-6">
        <Section title={`Aguardando aprovação (${regs.length})`}>
          {regs.length === 0 ? (
            <EmptyState icon={<UserCheck className="h-6 w-6" />} title="Nenhuma solicitação pendente" description="Crie um link de convite abaixo e envie no grupo." />
          ) : (
            <ul className="flex flex-col gap-2.5">
              {regs.map((r) => (
                <li key={r.id}>
                  <Card className="p-4">
                    <div className="flex items-start gap-3">
                      <Avatar name={r.fullName} size={44} />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{r.fullName}</p>
                        <p className="truncate text-sm text-muted">{r.email}</p>
                        {r.phone && <p className="text-sm text-muted">{r.phone}</p>}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {r.functionIds.map((f) => (
                            <Badge key={f} tone="primary">
                              {fnName.get(f) ?? "Função removida"}
                            </Badge>
                          ))}
                        </div>
                        <p className="mt-1.5 text-xs text-muted">Enviado em {formatInstant(r.createdAt)}</p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <ActionButton action={approveRegistrationAction.bind(null, r.id)} variant="primary" icon={<Check className="h-4 w-4" aria-hidden />}>
                        Aprovar
                      </ActionButton>
                      <ActionButton
                        action={rejectRegistrationAction.bind(null, r.id)}
                        variant="secondary"
                        icon={<X className="h-4 w-4" aria-hidden />}
                        confirm={{ title: `Recusar ${r.displayName}?`, description: "A solicitação é apagada. A pessoa pode se cadastrar de novo se tiver o link.", confirmLabel: "Recusar", danger: true }}
                      >
                        Recusar
                      </ActionButton>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <InviteLinks links={activeInvites.map((i) => ({ id: i.id, expiresAt: formatInstant(i.expiresAt) }))} />
      </div>
    </>
  );
}

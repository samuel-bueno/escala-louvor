import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, gte, sql } from "drizzle-orm";
import { AvailabilityMark, List, PageHeader, Section } from "@/components/ui/primitives";
import { formatDate, formatDayMonth, todayIn } from "@/domain/dates";
import { UnavailabilityManager } from "@/features/people/unavailability-manager";
import { canSeeUnavailabilityReasons, isLeader } from "@/domain/permissions";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { participants, unavailability } from "@/server/db/schema";

export const metadata: Metadata = { title: "Disponibilidade" };

export default async function AvailabilityPage() {
  const user = await requireUser();
  const today = todayIn();
  const own = user.participantId ? await db.select().from(unavailability).where(eq(unavailability.participantId, user.participantId)).orderBy(asc(unavailability.startDate)) : [];
  // Visão da liderança: todas as indisponibilidades futuras (sem expor motivos a membros).
  const isAdmin = canSeeUnavailabilityReasons(user);
  const team =
    isLeader(user)
      ? await db
          .select({ id: unavailability.id, pid: participants.id, name: participants.displayName, start: unavailability.startDate, end: unavailability.endDate, reason: isAdmin ? unavailability.reason : sql<string | null>`null` })
          .from(unavailability)
          .innerJoin(participants, eq(participants.id, unavailability.participantId))
          .where(and(eq(unavailability.organizationId, user.organizationId), gte(unavailability.endDate, today), eq(participants.active, true)))
          .orderBy(asc(unavailability.startDate))
      : [];

  return (
    <>
      <PageHeader title="Disponibilidade" subtitle="Informe quando não pode servir. A sugestão de escalas respeita automaticamente." />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-10">
        <Section title="Minhas datas">
          {user.participantId ? (
            <UnavailabilityManager participantId={user.participantId} today={today} rows={own} />
          ) : (
            <p className="text-[13.5px] text-muted">Seu acesso não está ligado a um participante, então não há disponibilidade pessoal para informar.</p>
          )}
        </Section>

        {isLeader(user) && (
          <Section title="Equipe" hint="próximas ausências">
            {team.length === 0 ? (
              <p className="text-[13.5px] text-muted">
                <span className="mr-1.5 font-mono text-success">✓</span>Ninguém informou indisponibilidade.
              </p>
            ) : (
              <List>
                {team.map((t) => (
                  <li key={t.id}>
                    <Link href={`/pessoas/${t.pid}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/60">
                      <AvailabilityMark state="unavailable" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium">{t.name}</span>
                        {t.reason && <span className="block truncate text-[12.5px] text-muted">{t.reason}</span>}
                      </span>
                      <span className="tabular shrink-0 font-mono text-[12.5px] text-muted">{t.start === t.end ? formatDate(t.start) : `${formatDayMonth(t.start)}–${formatDayMonth(t.end)}`}</span>
                    </Link>
                  </li>
                ))}
              </List>
            )}
            <p className="mt-2 text-[12px] text-subtle">{isAdmin ? "Motivos ficam visíveis só para a administração e para a própria pessoa." : "Você vê as datas, não os motivos."}</p>
          </Section>
        )}
      </div>
    </>
  );
}

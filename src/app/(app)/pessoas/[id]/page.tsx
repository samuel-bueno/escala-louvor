import { Mail, Pencil, Phone, Star } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/layout/back-link";
import { ActionButton } from "@/components/ui/action-button";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { roleLabel } from "@/domain/permissions";
import { Badge, PageHeader, Section, Stat } from "@/components/ui/primitives";
import { formatDayMonth, monthKey, todayIn, WEEKDAY_SHORT_NAMES, weekdayName } from "@/domain/dates";
import { ConfirmationStatus } from "@/features/schedule/confirmation-status";
import { ResetLinkButton } from "@/features/people/reset-link-button";
import { UnavailabilityManager } from "@/features/people/unavailability-manager";
import { LEVEL_LABELS } from "@/lib/validation";
import { deleteParticipantAction, setParticipantActiveAction } from "@/server/actions/participants";
import { requireAdminPage } from "@/server/auth/session";
import { getRules } from "@/server/queries/core";
import { getParticipant, getParticipantSchedule } from "@/server/queries/participants";

export const metadata: Metadata = { title: "Perfil" };

export default async function ParticipantPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminPage();
  const { id } = await params;
  const today = todayIn();
  const [p, next, past, rules] = await Promise.all([
    getParticipant(user.organizationId, id),
    getParticipantSchedule(user.organizationId, id, today, "next", 10),
    getParticipantSchedule(user.organizationId, id, today, "past", 12),
    getRules(user.organizationId),
  ]);
  if (!p) notFound();
  const month = monthKey(today);
  const monthCount = new Set([...next, ...past].filter((s) => monthKey(s.date) === month && s.eventStatus !== "cancelled").map((s) => s.eventId)).size;
  const limit = p.monthlyLimit ?? rules.defaultMonthlyLimit;

  return (
    <>
      <PageHeader
        back={<BackLink href="/pessoas" label="Pessoas" />}
        title={
          <span className="flex items-center gap-3">
            <Avatar name={p.fullName} size={44} muted={!p.active} />
            <span className="min-w-0">
              <span className="block truncate">{p.fullName}</span>
              <span className="block text-[13px] font-normal text-muted">
                {p.displayName !== p.fullName.split(" ")[0] ? `"${p.displayName}" · ` : ""}
                {p.level ? LEVEL_LABELS[p.level] : "Participante"}
                {!p.active && " · Inativo"}
              </span>
            </span>
          </span>
        }
        actions={
          <ButtonLink href={`/pessoas/${id}/editar`} variant="secondary" size="sm" icon={<Pencil className="h-4 w-4" aria-hidden />}>
            Editar
          </ButtonLink>
        }
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-10">
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-3 gap-3 border-y border-border py-3">
              <Stat label="Neste mês" value={`${monthCount}/${limit}`} tone={monthCount >= limit ? "warning" : "neutral"} />
              <Stat label="Última" value={past[0] ? formatDayMonth(past[0].date) : "—"} />
              <Stat label="Próxima" value={next[0] ? formatDayMonth(next[0].date) : "—"} />
          </div>
          <div>
            <h2 className="mb-2 text-[13px] font-semibold">Funções e instrumentos</h2>
            <div className="flex flex-wrap gap-1.5">
              {p.functions.length ? (
                p.functions.map((f) => (
                  <Badge key={f.functionId} tone={f.isPrimary ? "primary" : "neutral"} icon={f.isPrimary ? <Star className="h-3 w-3" aria-hidden /> : undefined}>
                    {f.name}
                    {f.isPrimary && <span className="sr-only"> (principal)</span>}
                  </Badge>
                ))
              ) : (
                <p className="text-[13px] text-warning">Nenhuma função cadastrada — esta pessoa não entra na geração automática.</p>
              )}
            </div>
            <dl className="mt-5 space-y-3 text-[13.5px]">
              {p.email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted" aria-hidden />
                  <dt className="sr-only">E-mail</dt>
                  <dd className="truncate">{p.email}</dd>
                </div>
              )}
              {p.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted" aria-hidden />
                  <dt className="sr-only">Telefone</dt>
                  <dd>
                    <a href={`tel:${p.phone.replace(/[^\d+]/g, "")}`} className="text-accent">
                      {p.phone}
                    </a>
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-[12px] text-muted">Dias habituais</dt>
                <dd className="text-fg-2">{p.usualDays.length ? p.usualDays.map((d) => WEEKDAY_SHORT_NAMES[d]).join(", ") : "Qualquer dia"}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-muted">Acesso ao app</dt>
                <dd className="text-fg-2">{p.account ? `${p.account.email} · ${roleLabel(p.account)}` : "Sem acesso"}</dd>
              </div>
              {p.notes && (
                <div>
                  <dt className="text-[12px] text-muted">Observações (liderança)</dt>
                  <dd className="whitespace-pre-line text-fg-2">{p.notes}</dd>
                </div>
              )}
            </dl>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            {p.account && <ResetLinkButton participantId={id} name={p.displayName} />}
            <ActionButton
              action={setParticipantActiveAction.bind(null, id, !p.active)}
              confirm={
                p.active
                  ? { title: `Desativar ${p.displayName}?`, description: "A pessoa continua no histórico, mas deixa de entrar em novas escalas e perde o acesso ao app.", confirmLabel: "Desativar" }
                  : undefined
              }
            >
              {p.active ? "Desativar" : "Reativar"}
            </ActionButton>
            <ActionButton
              action={deleteParticipantAction.bind(null, id)}
              variant="dangerGhost"
              confirm={{ title: "Excluir definitivamente?", description: "Só é possível excluir quem nunca participou de escalas. Caso contrário, use Desativar.", confirmLabel: "Excluir", danger: true }}
            >
              Excluir
            </ActionButton>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-8">
          <Section title="Próximas escalas">
            <ScheduleList rows={next} empty="Nenhuma escala futura." />
          </Section>
          <Section title="Indisponibilidade">
            <UnavailabilityManager participantId={id} today={today} rows={p.unavailability} />
          </Section>
          <Section title="Histórico recente">
            <ScheduleList rows={past} empty="Ainda não participou de escalas." />
          </Section>
        </div>
      </div>
    </>
  );
}

function ScheduleList({ rows, empty }: { rows: Awaited<ReturnType<typeof getParticipantSchedule>>; empty: string }) {
  if (!rows.length) return <p className="text-[13.5px] text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-border rounded-[var(--radius-card)] border border-border bg-surface">
      {rows.map((r) => (
        <li key={r.slotId}>
          <Link href={`/eventos/${r.eventId}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/60">
            <span className="tabular w-12 shrink-0 font-mono text-[13px]">{formatDayMonth(r.date)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium">{r.title}</span>
              <span className="block text-[12.5px] text-muted">
                {weekdayName(r.date)} · {r.functionName}
              </span>
            </span>
            {r.eventStatus === "cancelled" ? <Badge tone="danger">Cancelado</Badge> : <ConfirmationStatus status={r.status} />}
          </Link>
        </li>
      ))}
    </ul>
  );
}

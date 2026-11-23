import { ChevronRight, UserCheck, UserPlus, Users } from "lucide-react";
import { eq, sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { FilterTabs, SearchField } from "@/components/ui/filters";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { formatDayMonth, todayIn } from "@/domain/dates";
import { cn } from "@/lib/cn";
import { requireAdminPage } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { registrations } from "@/server/db/schema";
import { getFunctions, getRules } from "@/server/queries/core";
import { listParticipants } from "@/server/queries/participants";
import { plural } from "@/lib/plural";

export const metadata: Metadata = { title: "Pessoas" };

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ funcao?: string; inativos?: string; q?: string }> }) {
  const user = await requireAdminPage();
  const sp = await searchParams;
  const today = todayIn();
  const [people, functions, rules] = await Promise.all([listParticipants(user.organizationId, today, { includeInactive: true }), getFunctions(user.organizationId), getRules(user.organizationId)]);
  const pendingRegs = Number((await db.select({ n: sql<number>`count(*)` }).from(registrations).where(eq(registrations.organizationId, user.organizationId)).get())?.n ?? 0);
  const showInactive = sp.inativos === "1";
  const q = (sp.q ?? "").trim().toLowerCase();
  const list = people.filter((p) => (showInactive || p.active) && (!sp.funcao || p.functions.some((f) => f.functionId === sp.funcao)) && (!q || `${p.fullName} ${p.displayName}`.toLowerCase().includes(q)));
  const inactiveCount = people.filter((p) => !p.active).length;
  const link = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams({ ...(sp.funcao ? { funcao: sp.funcao } : {}), ...(showInactive ? { inativos: "1" } : {}), ...(sp.q ? { q: sp.q } : {}) });
    for (const [k, v] of Object.entries(patch)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    const s = params.toString();
    return `/pessoas${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Pessoas"
        subtitle={`${people.filter((p) => p.active).length} ${plural(people.filter((p) => p.active).length, "pessoa ativa", "pessoas ativas")} no ministério`}
        actions={
          <>
            <ButtonLink href="/pessoas/solicitacoes" variant="secondary" size="sm" icon={<UserCheck className="h-4 w-4" aria-hidden />}>
              Convites{pendingRegs > 0 ? ` (${pendingRegs})` : ""}
            </ButtonLink>
            <ButtonLink href="/pessoas/novo" size="sm" icon={<UserPlus className="h-4 w-4" aria-hidden />}>
              Adicionar pessoa
            </ButtonLink>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3">
        <SearchField defaultValue={sp.q} label="Buscar pessoa" placeholder="Buscar por nome" hidden={{ funcao: sp.funcao, inativos: showInactive ? "1" : undefined }} className="sm:max-w-sm" />
        <FilterTabs
          label="Filtrar por função"
          items={[{ href: link({ funcao: undefined }), label: "Todas", active: !sp.funcao }, ...functions.map((f) => ({ href: link({ funcao: f.id }), label: f.name, active: sp.funcao === f.id }))]}
        />
      </div>

      {list.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users />}
            title={people.length === 0 ? "Nenhuma pessoa cadastrada" : "Ninguém encontrado"}
            description={people.length === 0 ? "Cadastre ministros e músicos com suas funções e instrumentos." : "Ajuste a busca ou o filtro."}
            action={people.length === 0 && <ButtonLink href="/pessoas/novo">Adicionar primeira pessoa</ButtonLink>}
          />
        </Card>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
          <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_90px_120px_20px] gap-4 border-b border-border px-4 py-2 text-[11.5px] font-medium text-muted md:grid">
            <span>Pessoa</span>
            <span>Funções</span>
            <span className="text-right">Mês</span>
            <span>Próxima escala</span>
            <span />
          </div>
          <ul className="divide-y divide-border">
            {list.map((p) => {
              const limit = p.monthlyLimit ?? rules.defaultMonthlyLimit;
              return (
                <li key={p.id}>
                  <Link
                    href={`/pessoas/${p.id}`}
                    className={cn("grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0.5 px-4 py-2.5 transition-colors hover:bg-surface-2/60 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_90px_120px_20px]", !p.active && "opacity-55")}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <Avatar name={p.fullName} size={30} muted={!p.active} />
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-medium">{p.displayName}</span>
                        <span className="block truncate text-[12.5px] text-muted md:hidden">{p.functions.map((f) => f.name).join(", ") || "Sem funções"}</span>
                      </span>
                      {!p.active && <Badge>Inativo</Badge>}
                      {p.unavailableToday && <Badge tone="danger">indisponível hoje</Badge>}
                    </span>
                    <span className="hidden truncate text-[13px] text-fg-2 md:block">{p.functions.map((f) => f.name).join(", ") || <span className="text-subtle">Sem funções</span>}</span>
                    <span className={cn("tabular text-right font-mono text-[12.5px]", p.monthCount >= limit ? "text-warning" : "text-muted")}>
                      {p.monthCount}/{limit}
                    </span>
                    <span className="hidden font-mono text-[12.5px] text-muted md:block">{p.nextDate ? formatDayMonth(p.nextDate) : "—"}</span>
                    <ChevronRight className="hidden h-4 w-4 text-subtle md:block" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {inactiveCount > 0 && (
        <p className="mt-4 text-center">
          <Link href={link({ inativos: showInactive ? undefined : "1" })} className="link-action">
            {showInactive ? "Ocultar inativos" : `Mostrar ${inactiveCount} ${plural(inactiveCount, "inativo", "inativos")}`}
          </Link>
        </p>
      )}
    </>
  );
}

import type { Metadata } from "next";
import { desc, eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { ThemeSwitch } from "@/components/layout/theme-switch";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/components/ui/primitives";
import { formatInstant, todayIn } from "@/domain/dates";
import { describeRecurrence } from "@/domain/recurrence";
import { CategoryManager, DistributionForm, RecurrenceManager } from "@/features/settings/settings-forms";
import { SettingsNav } from "@/features/settings/settings-nav";
import { requireAdminPage } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { auditLog, recurrenceRules, songCategories, songs, users } from "@/server/db/schema";
import { getFunctions, getOrganization, getSettings } from "@/server/queries/core";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const user = await requireAdminPage();
  const orgId = user.organizationId;
  const [settings, functions, rules, categories, logs, org, jar] = await Promise.all([
    getSettings(orgId),
    getFunctions(orgId),
    db.select().from(recurrenceRules).where(eq(recurrenceRules.organizationId, orgId)),
    db
      .select({ id: songCategories.id, name: songCategories.name, songs: sql<number>`(select count(*) from ${songs} s where s.category_id = "song_categories"."id")` })
      .from(songCategories)
      .where(eq(songCategories.organizationId, orgId))
      .orderBy(songCategories.sortOrder),
    db
      .select({ id: auditLog.id, summary: auditLog.summary, createdAt: auditLog.createdAt, who: users.name })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.userId))
      .where(eq(auditLog.organizationId, orgId))
      .orderBy(desc(auditLog.createdAt))
      .limit(30),
    getOrganization(orgId),
    cookies(),
  ]);

  return (
    <>
      <PageHeader title="Configurações" subtitle={org?.name} />
      <div className="lg:flex lg:gap-10">
        <SettingsNav sections={SECTIONS} />
        <div className="flex min-w-0 max-w-3xl flex-1 flex-col">
        <SettingsBlock id="series" title="Cultos e séries" description="Os domingos são criados automaticamente até 31/12/2027. Ajuste o horário padrão aqui; cada data pode ser editada ou cancelada individualmente.">
          <RecurrenceManager
            today={todayIn()}
            rules={rules.map((r) => ({
              id: r.id,
              title: r.title,
              type: r.type,
              startTime: r.startTime,
              endTime: r.endTime,
              location: r.location,
              active: r.active,
              isSundaySeries: r.weekday === 0 && r.type === "culto" && r.nthOfMonth === null,
              description: describeRecurrence(r),
            }))}
          />
        </SettingsBlock>
        <SettingsBlock id="distribuicao" title="Distribuição" description="Regras usadas ao sugerir escalas. Os padrões funcionam bem para a maioria das equipes.">
          <DistributionForm settings={settings} functions={functions.map((f) => ({ id: f.id, name: f.name }))} />
        </SettingsBlock>
        <SettingsBlock id="categorias" title="Categorias de músicas">
          <CategoryManager categories={categories.map((c) => ({ ...c, songs: Number(c.songs) }))} />
        </SettingsBlock>
        <SettingsBlock id="aparencia" title="Aparência">
          <ThemeSwitch current={jar.get("theme")?.value ?? "system"} withLabels />
        </SettingsBlock>
        <SettingsBlock id="atividade" title="Atividade recente" description="Quem fez o quê e quando.">
          <ul className="divide-y divide-border rounded-[var(--radius-card)] border border-border bg-surface">
            {logs.map((l) => (
              <li key={l.id} className="px-4 py-2.5">
                <p className="text-[13.5px]">{l.summary}</p>
                <p className="text-[12px] text-muted">
                  {l.who ?? "Sistema"} · <span className="font-mono">{formatInstant(l.createdAt)}</span>
                </p>
              </li>
            ))}
          </ul>
        </SettingsBlock>
        <SettingsBlock id="privacidade" title="Privacidade (LGPD)">
          <p className="max-w-prose text-[13.5px] text-muted">
            Telefone, e-mail, motivos de indisponibilidade e observações da liderança são visíveis apenas para administradores (e, no caso da indisponibilidade, para a própria pessoa). Links públicos mostram só nomes de exibição, funções e
            repertório. Pessoas sem histórico podem ser excluídas no perfil; as demais podem ser desativadas. Exportação automática de dados pessoais ainda não está disponível (planejada).
          </p>
        </SettingsBlock>
        </div>
      </div>
    </>
  );
}

const SECTIONS = [
  { id: "series", label: "Cultos e séries" },
  { id: "distribuicao", label: "Distribuição" },
  { id: "categorias", label: "Categorias" },
  { id: "aparencia", label: "Aparência" },
  { id: "atividade", label: "Atividade" },
  { id: "privacidade", label: "Privacidade" },
];

function SettingsBlock({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-16 border-t border-border py-8 first:border-t-0 first:pt-0 lg:scroll-mt-8">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {description && <p className="mt-1 mb-4 max-w-prose text-[13px] text-muted">{description}</p>}
      <div className={cn("min-w-0", !description && "mt-3")}>{children}</div>
    </section>
  );
}

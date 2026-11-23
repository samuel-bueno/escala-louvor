import { CalendarOff, ChevronRight, FileUp, Guitar, Layers, ListMusic, LogOut, Settings2, Smartphone, UserCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { ThemeSwitch } from "@/components/layout/theme-switch";
import { Avatar } from "@/components/ui/avatar";
import { List, Section } from "@/components/ui/primitives";
import { PasskeyManager } from "@/features/auth/passkey-ui";
import { formatInstant } from "@/domain/dates";
import { db } from "@/server/db/client";
import { passkeys } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { logoutAction } from "@/server/actions/auth";
import { canManageSongs, isLeader, roleLabel } from "@/domain/permissions";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Mais" };

type L = { href: string; label: string; icon: typeof Guitar };

export default async function MorePage() {
  const user = await requireUser();
  const theme = (await cookies()).get("theme")?.value ?? "system";
  const name = user.participantName ?? user.name;
  const myPasskeys = await db.select().from(passkeys).where(eq(passkeys.userId, user.id)).orderBy(passkeys.createdAt);
  const groups: { title: string; links: L[] }[] =
    user.role === "admin"
      ? [
          {
            title: "Equipe",
            links: [
              { href: "/disponibilidade", label: "Disponibilidade", icon: CalendarOff },
              { href: "/funcoes", label: "Funções e instrumentos", icon: Guitar },
              { href: "/pessoas/solicitacoes", label: "Convites e solicitações", icon: UserCheck },
            ],
          },
          {
            title: "Repertório",
            links: [
              { href: "/musicas", label: "Músicas", icon: ListMusic },
              { href: "/musicas/importar", label: "Importar músicas", icon: FileUp },
            ],
          },
          {
            title: "Organização",
            links: [
              { href: "/escalas/gerar", label: "Gerar várias escalas", icon: Layers },
              { href: "/configuracoes", label: "Configurações", icon: Settings2 },
            ],
          },
        ]
      : isLeader(user)
        ? [
            { title: "Equipe", links: [{ href: "/disponibilidade", label: "Disponibilidade", icon: CalendarOff }] },
            { title: "Repertório", links: [{ href: "/musicas", label: "Músicas", icon: ListMusic }, ...(canManageSongs(user) ? [{ href: "/musicas/importar", label: "Importar músicas", icon: FileUp }] : [])] },
          ]
        : [{ title: "Equipe", links: [{ href: "/disponibilidade", label: "Minha disponibilidade", icon: CalendarOff }] }];

  return (
    <>
      <header className="mb-6 flex items-center gap-3">
        <Avatar name={name} size={40} />
        <div>
          <h1 className="text-[18px] leading-tight font-semibold">{name}</h1>
          <p className="text-[13px] text-muted">{roleLabel(user)}</p>
        </div>
      </header>
      <div className="flex flex-col gap-7">
        {groups.map((g) => (
          <Section key={g.title} title={g.title}>
            <List>
              {g.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="flex min-h-12 items-center gap-3 px-4 text-[14.5px] hover:bg-surface-2/60">
                    <l.icon className="h-[18px] w-[18px] text-subtle" strokeWidth={1.75} aria-hidden />
                    <span className="flex-1">{l.label}</span>
                    <ChevronRight className="h-4 w-4 text-subtle" aria-hidden />
                  </Link>
                </li>
              ))}
            </List>
          </Section>
        ))}
        <Section title="Entrar com biometria">
          <PasskeyManager items={myPasskeys.map((p) => ({ id: p.id, deviceName: p.deviceName, createdAt: formatInstant(p.createdAt).slice(0, 10), lastUsedAt: p.lastUsedAt ? formatInstant(p.lastUsedAt).slice(0, 10) : null }))} />
        </Section>
        <Section title="Tema">
          <ThemeSwitch current={theme} withLabels />
        </Section>
        <Section title="Instalar como app">
          <div className="flex gap-3 text-[13.5px] text-muted">
            <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden />
            <p>
              <span className="text-fg-2">iPhone:</span> abra no Safari, toque em Compartilhar e escolha &quot;Adicionar à Tela de Início&quot;. <span className="text-fg-2">Android:</span> menu ⋮ → &quot;Instalar app&quot;.
            </p>
          </div>
        </Section>
        <form action={logoutAction}>
          <button className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface text-[14px] font-medium text-danger hover:bg-danger-soft">
            <LogOut className="h-4 w-4" aria-hidden /> Sair da conta
          </button>
        </form>
      </div>
    </>
  );
}

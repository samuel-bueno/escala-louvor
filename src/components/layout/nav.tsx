"use client";

import { CalendarDays, CalendarOff, ChevronsUpDown, Guitar, Home, LayoutGrid, ListMusic, LogOut, Settings2, Users, Workflow } from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { logoutAction } from "@/server/actions/auth";
import { Avatar } from "@/components/ui/avatar";
import { LogoFull, LogoMark } from "./logo";
import { ThemeSwitch } from "./theme-switch";

type Item = { href: string; label: string; icon: typeof Home; match?: string[] };
type Group = { label?: string; items: Item[] };

const adminGroups: Group[] = [
  {
    items: [
      { href: "/", label: "Início", icon: Home },
      { href: "/agenda", label: "Agenda", icon: CalendarDays, match: ["/agenda", "/eventos"] },
      { href: "/escalas", label: "Escalas", icon: Workflow, match: ["/escalas"] },
    ],
  },
  {
    label: "Equipe",
    items: [
      { href: "/pessoas", label: "Pessoas", icon: Users },
      { href: "/disponibilidade", label: "Disponibilidade", icon: CalendarOff },
      { href: "/funcoes", label: "Funções e instrumentos", icon: Guitar },
    ],
  },
  { label: "Repertório", items: [{ href: "/musicas", label: "Músicas", icon: ListMusic }] },
];
const leaderGroups: Group[] = [
  {
    items: [
      { href: "/", label: "Início", icon: Home },
      { href: "/agenda", label: "Agenda", icon: CalendarDays, match: ["/agenda", "/eventos"] },
      { href: "/escalas", label: "Escalas", icon: Workflow, match: ["/escalas"] },
    ],
  },
  {
    label: "Equipe",
    items: [{ href: "/disponibilidade", label: "Disponibilidade", icon: CalendarOff }],
  },
  { label: "Repertório", items: [{ href: "/musicas", label: "Músicas", icon: ListMusic }] },
];
const memberGroups: Group[] = [
  {
    items: [
      { href: "/", label: "Início", icon: Home },
      { href: "/agenda", label: "Agenda", icon: CalendarDays, match: ["/agenda", "/eventos"] },
      { href: "/disponibilidade", label: "Disponibilidade", icon: CalendarOff },
      { href: "/musicas", label: "Músicas", icon: ListMusic },
    ],
  },
];

function isActive(pathname: string, item: Item) {
  if (item.href === "/") return pathname === "/";
  return (item.match ?? [item.href]).some((m) => pathname === m || pathname.startsWith(`${m}/`));
}

/** Indicador de navegação pendente (feedback imediato ao tocar). */
function Pending() {
  const { pending } = useLinkStatus();
  return <span aria-hidden className={cn("ml-auto h-1.5 w-1.5 rounded-full bg-accent transition-opacity", pending ? "animate-pulse opacity-100" : "opacity-0")} />;
}

function NavLink({ item, pathname }: { item: Item; pathname: string }) {
  const active = isActive(pathname, item);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={item.label}
      className={cn(
        "group flex h-9 items-center justify-center gap-2.5 rounded-md px-2 text-[13.5px] font-medium transition-colors lg:h-8 lg:justify-start",
        active ? "bg-surface-3/70 text-fg" : "text-fg-2 hover:bg-surface-2 hover:text-fg",
      )}
    >
      <item.icon className={cn("h-[18px] w-[18px] lg:h-4 lg:w-4", active ? "text-accent" : "text-subtle group-hover:text-fg-2")} strokeWidth={1.75} aria-hidden />
      <span className="sr-only truncate lg:not-sr-only">{item.label}</span>
      <span className="hidden lg:contents">
        <Pending />
      </span>
    </Link>
  );
}

export function Sidebar({ role, leader, userName, theme, roleText }: { role: "admin" | "member"; leader: boolean; userName: string; theme: string; roleText: string }) {
  const pathname = usePathname();
  const groups = role === "admin" ? adminGroups : leader ? leaderGroups : memberGroups;
  return (
    <aside className="sticky top-0 hidden h-dvh w-16 shrink-0 flex-col border-r border-border bg-sidebar px-2 pt-4 pb-3 md:flex lg:w-[236px] lg:px-3">
      <Link href="/" aria-label="Escala Louvor — Início" className="mb-5 flex flex-col items-center gap-1.5 rounded-md px-1.5 py-1.5 hover:bg-surface-2 lg:items-start">
        {/* Coluna de ícones (tablet): só a marca. Barra lateral completa (desktop): marca + nome do app. */}
        <span className="lg:hidden">
          <LogoMark size={30} />
        </span>
        <span className="hidden lg:block">
          <LogoFull width={168} />
        </span>
        <span className="hidden text-[11.5px] text-muted lg:block">Escala Louvor</span>
      </Link>

      <nav aria-label="Principal" className="flex flex-1 flex-col gap-5 overflow-y-auto">
        {groups.map((g, i) => (
          <div key={i}>
            {g.label && <p className="mb-1 hidden px-2 text-[11.5px] font-medium text-subtle lg:block">{g.label}</p>}
            {g.label && i > 0 && <div aria-hidden className="mx-2 mb-2 border-t border-border lg:hidden" />}
            <ul className="flex flex-col gap-px">
              {g.items.map((item) => (
                <li key={item.href}>
                  <NavLink item={item} pathname={pathname} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {role === "admin" && (
        <div className="mb-2">
          <NavLink item={{ href: "/configuracoes", label: "Configurações", icon: Settings2 }} pathname={pathname} />
        </div>
      )}

      <details className="group relative border-t border-border pt-2">
        <summary aria-label={`Conta de ${userName}`} className="flex cursor-pointer list-none items-center justify-center gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-surface-2 lg:justify-start [&::-webkit-details-marker]:hidden">
          <Avatar name={userName} size={26} />
          <span className="hidden min-w-0 flex-1 leading-tight lg:block">
            <span className="block truncate text-[13px] font-medium">{userName}</span>
            <span className="block text-[11.5px] text-muted">{roleText}</span>
          </span>
          <ChevronsUpDown className="hidden h-3.5 w-3.5 text-subtle lg:block" aria-hidden />
        </summary>
        <div className="anim-rise absolute bottom-full left-0 mb-2 w-56 rounded-lg border border-border bg-surface p-2 shadow-[var(--shadow-pop)]">
          <p className="mb-1.5 px-1 text-[11.5px] font-medium text-subtle">Tema</p>
          <ThemeSwitch current={theme} />
          <form action={logoutAction} className="mt-2 border-t border-border pt-2">
            <button className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] font-medium text-fg-2 hover:bg-surface-2 hover:text-fg">
              <LogOut className="h-4 w-4 text-subtle" aria-hidden /> Sair
            </button>
          </form>
        </div>
      </details>
    </aside>
  );
}

/** Barra inferior no celular: até 5 destinos, alvo de 56px, respeita a safe area. */
export function BottomNav({ role, leader }: { role: "admin" | "member"; leader: boolean }) {
  const pathname = usePathname();
  const main: Item[] =
    role === "admin"
      ? [
          { href: "/", label: "Início", icon: Home },
          { href: "/agenda", label: "Agenda", icon: CalendarDays, match: ["/agenda", "/eventos"] },
          { href: "/escalas", label: "Escalas", icon: Workflow },
          { href: "/pessoas", label: "Pessoas", icon: Users },
        ]
      : leader
        ? [
            { href: "/", label: "Início", icon: Home },
            { href: "/agenda", label: "Agenda", icon: CalendarDays, match: ["/agenda", "/eventos"] },
            { href: "/escalas", label: "Escalas", icon: Workflow },
            { href: "/musicas", label: "Músicas", icon: ListMusic },
          ]
        : memberGroups[0].items;
  const more: Item = {
    href: "/mais",
    label: "Mais",
    icon: LayoutGrid,
    match: ["/mais", "/configuracoes", "/funcoes", ...(role === "admin" ? ["/disponibilidade", "/musicas"] : leader ? ["/disponibilidade"] : [])],
  };
  return (
    <nav aria-label="Principal" className="bottom-nav safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/90 backdrop-blur-xl md:hidden">
      <ul className="mx-auto flex max-w-lg">
        {[...main, more].map((item) => {
          const active = isActive(pathname, item);
          return (
            <li key={item.href} className="flex-1">
              <Link href={item.href} aria-current={active ? "page" : undefined} className={cn("relative flex h-14 flex-col items-center justify-center gap-1 text-[10.5px] font-medium", active ? "text-fg" : "text-subtle")}>
                <span aria-hidden className={cn("absolute top-0 h-0.5 w-6 rounded-full bg-accent transition-opacity", active ? "opacity-100" : "opacity-0")} />
                <item.icon className="h-5 w-5" strokeWidth={active ? 2 : 1.75} aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

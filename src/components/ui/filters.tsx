import { Search } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Busca por GET: funciona sem JS e mantém filtros via campos ocultos. */
export function SearchField({ name = "q", defaultValue, placeholder, label, hidden = {}, className }: { name?: string; defaultValue?: string; placeholder: string; label: string; hidden?: Record<string, string | undefined>; className?: string }) {
  return (
    <form role="search" className={cn("relative", className)}>
      {Object.entries(hidden).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
      <input
        name={name}
        type="search"
        defaultValue={defaultValue}
        aria-label={label}
        placeholder={placeholder}
        className="h-11 w-full rounded-lg border border-border bg-surface pr-3 pl-9 text-fg placeholder:text-subtle hover:border-border-strong focus:border-border-strong focus:ring-2 focus:ring-ring/25 focus:outline-none sm:h-9 sm:text-[14px]"
      />
    </form>
  );
}

/** Filtros como abas de texto (sem pílulas): ativo = fundo sutil. */
export function FilterTabs({ items, label, className }: { items: { href: string; label: ReactNode; active: boolean }[]; label: string; className?: string }) {
  return (
    <nav aria-label={label} className={cn("-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0", className)}>
      {items.map((it, i) => (
        <Link
          key={i}
          href={it.href}
          aria-current={it.active ? "true" : undefined}
          className={cn("flex h-10 shrink-0 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors sm:h-8 sm:px-2.5", it.active ? "bg-surface-3 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg")}
        >
          {it.label}
        </Link>
      ))}
    </nav>
  );
}

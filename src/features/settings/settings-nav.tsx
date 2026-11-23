"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

export type SettingsSection = { id: string; label: string };

/**
 * Índice da página de Configurações: coluna fixa no desktop, faixa rolável no celular.
 * Destaca a seção visível (IntersectionObserver); funciona sem JS como âncoras simples.
 */
export function SettingsNav({ sections }: { sections: SettingsSection[] }) {
  const [active, setActive] = useState(sections[0]?.id);
  useEffect(() => {
    const els = sections.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-10% 0px -70% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [sections]);

  return (
    <nav aria-label="Seções de configurações" className="sticky top-0 z-20 -mx-4 mb-6 overflow-x-auto border-b border-border bg-bg/95 px-4 backdrop-blur sm:-mx-6 sm:px-6 lg:top-8 lg:z-auto lg:mx-0 lg:mb-0 lg:w-48 lg:shrink-0 lg:self-start lg:overflow-visible lg:border-b-0 lg:bg-transparent lg:px-0 lg:backdrop-blur-none">
      <ul className="flex gap-1 py-1.5 lg:flex-col lg:gap-0.5 lg:py-0">
        {sections.map((s) => (
          <li key={s.id} className="shrink-0">
            <a
              href={`#${s.id}`}
              aria-current={active === s.id ? "true" : undefined}
              onClick={() => setActive(s.id)}
              className={cn("flex h-10 items-center rounded-md px-3 text-[13px] font-medium transition-colors lg:h-8 lg:px-2.5", active === s.id ? "bg-surface-3 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg")}
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

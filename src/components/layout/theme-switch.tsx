"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { setThemeAction } from "@/server/actions/auth";

const options = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
  { value: "system", label: "Sistema", icon: Monitor },
] as const;

export function ThemeSwitch({ current, withLabels }: { current: string; withLabels?: boolean }) {
  const [value, setValue] = useState(current === "light" || current === "dark" ? current : "system");
  const [, start] = useTransition();
  const choose = (v: (typeof options)[number]["value"]) => {
    setValue(v);
    if (v === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", v);
    start(() => setThemeAction(v));
  };
  return (
    <div role="radiogroup" aria-label="Tema" className="flex w-full rounded-lg bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          aria-label={o.label}
          onClick={() => choose(o.value)}
          className={cn("flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md text-[13px] font-medium transition-colors sm:h-7", value === o.value ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg")}
        >
          <o.icon className="h-3.5 w-3.5" aria-hidden />
          {withLabels && o.label}
        </button>
      ))}
    </div>
  );
}

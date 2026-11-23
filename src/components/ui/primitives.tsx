import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "info" | "accent";

const toneText: Record<Tone, string> = {
  neutral: "text-muted",
  primary: "text-fg-2",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
  accent: "text-accent",
};
const toneDot: Record<Tone, string> = {
  neutral: "bg-subtle",
  primary: "bg-fg-2",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  accent: "bg-accent",
};

/**
 * Status discreto: ponto + texto (sem "pílula" colorida).
 * `boxed` só para os raros casos em que precisa se destacar de um fundo.
 */
export function Badge({ tone = "neutral", className, children, icon, boxed }: { tone?: Tone; className?: string; children: ReactNode; icon?: ReactNode; boxed?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[12px] leading-5 font-medium whitespace-nowrap",
        toneText[tone],
        boxed && "rounded-md bg-surface-2 px-1.5",
        className,
      )}
    >
      {icon ?? (tone !== "neutral" && <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", toneDot[tone])} />)}
      {children}
    </span>
  );
}

export function Dot({ tone, className }: { tone: Tone; className?: string }) {
  return <span aria-hidden className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", toneDot[tone], className)} />;
}

/** Superfície. Use com moderação: prefira divisórias e espaço. */
export function Card({ className, children, as = "div", ...rest }: ComponentProps<"div"> & { as?: "div" | "section" | "article" | "li" }) {
  const As = as as "div";
  return (
    <As className={cn("rounded-[var(--radius-card)] border border-border bg-surface", className)} {...rest}>
      {children}
    </As>
  );
}

export function CardHeader({ title, action, subtitle, icon }: { title: ReactNode; action?: ReactNode; subtitle?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pt-3.5 sm:px-5">
      <div className="flex min-w-0 items-start gap-2">
        {icon && <span className="mt-0.5 text-subtle">{icon}</span>}
        <div className="min-w-0">
          <h2 className="text-[14px] leading-6 font-semibold">{title}</h2>
          {subtitle && <p className="text-[13px] text-muted">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back}
        <h1 className="text-[22px] leading-tight font-semibold text-balance sm:text-[24px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[14px] text-muted text-pretty">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

/** Bloco de conteúdo com título discreto. Não é um cartão. */
export function Section({ title, children, action, className, hint }: { title: ReactNode; children: ReactNode; action?: ReactNode; className?: string; hint?: ReactNode }) {
  return (
    <section className={className}>
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-semibold text-fg">
          {title}
          {hint && <span className="ml-2 font-normal text-muted">{hint}</span>}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Lista com divisórias — a forma padrão de mostrar coleções. */
export function List({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn("divide-y divide-border overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface", className)}>{children}</ul>;
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-10 text-center", className)}>
      {icon && <div className="mb-3 text-subtle [&_svg]:h-6 [&_svg]:w-6">{icon}</div>}
      <p className="text-[14px] font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13.5px] text-muted text-pretty">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const calloutTone: Record<Tone, string> = {
  neutral: "border-border bg-surface-2",
  primary: "border-border bg-surface-2",
  success: "border-success/25 bg-success-soft",
  warning: "border-warning/30 bg-warning-soft",
  danger: "border-danger/30 bg-danger-soft",
  info: "border-info/25 bg-info-soft",
  accent: "border-accent/25 bg-accent-soft",
};

export function Callout({ tone = "info", icon, title, children, className, role }: { tone?: Tone; icon?: ReactNode; title?: ReactNode; children?: ReactNode; className?: string; role?: "alert" | "status" }) {
  return (
    <div role={role} className={cn("flex gap-2.5 rounded-lg border px-3.5 py-2.5 text-[13.5px]", calloutTone[tone], className)}>
      {icon && <span className={cn("mt-0.5 shrink-0", toneText[tone])}>{icon}</span>}
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-fg-2">{children}</div>}
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton", className)} />;
}

export function Stat({ label, value, hint, tone = "neutral" }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone }) {
  return (
    <div className="min-w-0">
      <p className="eyebrow">{label}</p>
      <p className={cn("tabular mt-0.5 text-[17px] font-semibold", tone !== "neutral" && toneText[tone])}>{value}</p>
      {hint && <p className="text-[12px] text-muted">{hint}</p>}
    </div>
  );
}

/** Indicador de disponibilidade: ✓ disponível · ! conflito · × indisponível */
export function AvailabilityMark({ state, label }: { state: "ok" | "conflict" | "unavailable"; label?: string }) {
  const map = {
    ok: { sym: "✓", cls: "bg-success-soft text-success", sr: "disponível" },
    conflict: { sym: "!", cls: "bg-warning-soft text-warning", sr: "conflito" },
    unavailable: { sym: "×", cls: "bg-danger-soft text-danger", sr: "indisponível" },
  }[state];
  return (
    <span className={cn("inline-grid h-5 w-5 shrink-0 place-items-center rounded-full font-mono text-[12px] leading-none font-semibold", map.cls)} title={label}>
      <span aria-hidden>{map.sym}</span>
      <span className="sr-only">{label ?? map.sr}</span>
    </span>
  );
}

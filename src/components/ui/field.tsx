"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";

const control =
  "w-full rounded-lg border border-border-strong bg-surface px-3 text-fg placeholder:text-subtle transition-[border-color,box-shadow] duration-150 hover:border-subtle focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/15 disabled:cursor-not-allowed disabled:opacity-55 aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/15";

export function Field({
  label,
  hint,
  error,
  children,
  className,
  optional,
  htmlFor,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
  optional?: boolean;
  htmlFor?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-fg-2">
        {label}
        {optional && <span className="ml-1 font-normal text-subtle">opcional</span>}
      </label>
      {children}
      {error ? (
        <p className="text-[13px] font-medium text-danger" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="text-[13px] text-muted">{hint}</p>
      )}
    </div>
  );
}

type InputProps = ComponentProps<"input"> & { label?: ReactNode; hint?: ReactNode; error?: string; optional?: boolean; wrapperClassName?: string };

export function Input({ label, hint, error, optional, wrapperClassName, className, id, ...rest }: InputProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const el = <input id={inputId} aria-invalid={!!error || undefined} className={cn(control, "h-11 sm:h-10", className)} {...rest} />;
  if (!label) return el;
  return (
    <Field label={label} hint={hint} error={error} optional={optional} htmlFor={inputId} className={wrapperClassName}>
      {el}
    </Field>
  );
}

type SelectProps = ComponentProps<"select"> & { label?: ReactNode; hint?: ReactNode; error?: string; optional?: boolean; wrapperClassName?: string };

export function Select({ label, hint, error, optional, wrapperClassName, className, id, children, ...rest }: SelectProps) {
  const auto = useId();
  const selId = id ?? auto;
  const el = (
    <select
      id={selId}
      aria-invalid={!!error || undefined}
      className={cn(
        control,
        "h-11 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 fill=%22none%22 stroke=%22%239a978f%22 stroke-width=%221.75%22 viewBox=%220 0 24 24%22><path d=%22m7 10 5 5 5-5%22/></svg>')] bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-9 sm:h-10",
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
  if (!label) return el;
  return (
    <Field label={label} hint={hint} error={error} optional={optional} htmlFor={selId} className={wrapperClassName}>
      {el}
    </Field>
  );
}

type TextareaProps = ComponentProps<"textarea"> & { label?: ReactNode; hint?: ReactNode; error?: string; optional?: boolean; wrapperClassName?: string };

export function Textarea({ label, hint, error, optional, wrapperClassName, className, id, ...rest }: TextareaProps) {
  const auto = useId();
  const tId = id ?? auto;
  const el = <textarea id={tId} aria-invalid={!!error || undefined} className={cn(control, "min-h-24 py-2.5 leading-relaxed", className)} {...rest} />;
  if (!label) return el;
  return (
    <Field label={label} hint={hint} error={error} optional={optional} htmlFor={tId} className={wrapperClassName}>
      {el}
    </Field>
  );
}

/** Opção marcável (funções, dias, filtros). Selecionado = tinta, não cor. */
export function CheckChip({ label, className, ...rest }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label
      className={cn(
        "relative inline-flex min-h-11 items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-[13.5px] font-medium text-fg-2 transition-colors select-none hover:bg-surface-2 has-[:checked]:border-fg has-[:checked]:bg-primary-soft has-[:checked]:text-fg has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring sm:min-h-9",
        className,
      )}
    >
      <input type="checkbox" className="peer sr-only" aria-label={typeof label === "string" ? label : undefined} {...rest} />
      <span aria-hidden className="grid h-4 w-4 place-items-center rounded-[4px] border border-border-strong bg-surface peer-checked:border-fg peer-checked:bg-fg">
        <svg viewBox="0 0 12 12" className="h-3 w-3 text-bg" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m2.5 6.2 2.3 2.3 4.7-5" />
        </svg>
      </span>
      {label}
    </label>
  );
}

/** Interruptor acessível (checkbox role=switch). Ligado = acento. */
export function Toggle({ label, description, className, ...rest }: ComponentProps<"input"> & { label: ReactNode; description?: ReactNode }) {
  return (
    <label className={cn("flex min-h-11 items-center justify-between gap-4 py-2", className)}>
      <span className="min-w-0">
        <span className="block text-[14px] font-medium">{label}</span>
        {description && <span className="block text-[13px] text-muted">{description}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input type="checkbox" role="switch" className="peer sr-only" {...rest} />
        <span className="h-6 w-10 rounded-full bg-surface-3 transition-colors peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-bg" />
        <span className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 peer-checked:translate-x-4" />
      </span>
    </label>
  );
}

/** Controle segmentado (ex.: Mês | Lista). */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("h-9 rounded-md px-3 text-[13px] font-medium transition-colors sm:h-7", value === o.value ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

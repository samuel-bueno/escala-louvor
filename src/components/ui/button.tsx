import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "soft" | "accent" | "dangerGhost" | "warningGhost";
type Size = "sm" | "md" | "lg" | "icon";

/*
 * Densidade responsiva: alvos de toque de 44px no celular, controles mais
 * compactos (36px) a partir do tablet — como apps de produtividade.
 */
const base =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium select-none whitespace-nowrap [&_svg]:shrink-0 transition-[background-color,color,border-color,opacity] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-45";
const variants: Record<Variant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary-hover",
  secondary: "border border-border-strong bg-surface text-fg hover:bg-surface-2",
  ghost: "text-fg-2 hover:bg-surface-2 hover:text-fg",
  danger: "bg-danger text-white hover:opacity-90",
  soft: "bg-surface-2 text-fg hover:bg-surface-3",
  accent: "bg-accent text-white hover:bg-accent-strong",
  /* Destrutivo irreversível (apagar): texto vermelho, discreto até o hover. */
  dangerGhost: "text-danger hover:bg-danger-soft",
  /* Destrutivo reversível (cancelar): âmbar, para diferenciar de apagar. */
  warningGhost: "text-warning hover:bg-warning-soft",
};
const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-[13px] sm:h-8",
  md: "h-11 px-4 text-[14px] sm:h-9 sm:px-3.5",
  lg: "h-12 px-5 text-[15px] sm:h-10",
  icon: "h-11 w-11 sm:h-8 sm:w-8",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

type ButtonProps = ComponentProps<"button"> & { variant?: Variant; size?: Size; loading?: boolean; icon?: ReactNode };

export function Button({ variant = "primary", size = "md", loading, icon, className, children, disabled, type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

type LinkProps = ComponentProps<typeof Link> & { variant?: Variant; size?: Size; icon?: ReactNode };

export function ButtonLink({ variant = "primary", size = "md", icon, className, children, ...rest }: LinkProps) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}

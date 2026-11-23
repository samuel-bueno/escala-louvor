"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Dialog sobre o <dialog> nativo (foco preso, Esc fecha, acessível).
 * No celular vira "sheet" ancorado embaixo e nunca passa da altura da tela.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // O autoFocus do React roda antes de o <dialog> abrir e se perde: o foco inicial vai para o
      // elemento marcado com data-autofocus (campo de busca, botão seguro de uma confirmação).
      d.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="dlg-title"
      className={cn(
        "anim-sheet m-0 mt-auto max-h-none w-full max-w-none overflow-hidden rounded-t-2xl border border-border bg-surface p-0 text-fg shadow-[var(--shadow-pop)] sm:m-auto sm:rounded-xl",
        size === "sm" && "sm:max-w-md",
        size === "md" && "sm:max-w-lg",
        size === "lg" && "sm:max-w-3xl",
      )}
    >
      {open && (
        <div className="flex max-h-[min(88dvh,820px)] flex-col">
          <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
            <div className="min-w-0">
              <h2 id="dlg-title" className="text-[16px] font-semibold">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-[13.5px] text-muted">{description}</p>}
            </div>
            <button type="button" onClick={onClose} className="-mt-1 -mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg sm:h-8 sm:w-8" aria-label="Fechar">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
          {footer && <div className="safe-bottom flex flex-col-reverse gap-2 border-t border-border px-5 py-3 sm:flex-row sm:justify-end">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

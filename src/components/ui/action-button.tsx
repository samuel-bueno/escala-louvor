"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Button } from "./button";
import { Dialog } from "./dialog";
import { toastResult } from "./toast";

type Result = { ok: true; message?: string } | { ok: false; error: string };

/**
 * Botão que executa uma server action com feedback (loading, toast) e,
 * opcionalmente, confirmação antes de ações destrutivas.
 */
export function ActionButton({
  action,
  children,
  variant = "secondary",
  size = "md",
  icon,
  confirm,
  className,
}: {
  action: () => Promise<Result | void>;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "soft" | "dangerGhost" | "warningGhost";
  size?: "sm" | "md" | "lg";
  icon?: ReactNode;
  confirm?: { title: string; description: ReactNode; confirmLabel: string; danger?: boolean; /** Confirmar sem ser "perigo" (ex.: ação reversível). */ tone?: "primary" | "danger" };
  className?: string;
}) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const run = () =>
    start(async () => {
      const res = await action();
      setOpen(false);
      if (res) {
        toastResult(res);
        if (res.ok) router.refresh();
      }
    });

  return (
    <>
      <Button variant={variant} size={size} icon={icon} loading={pending && !open} onClick={() => (confirm ? setOpen(true) : run())} className={className}>
        {children}
      </Button>
      {confirm && (
        <Dialog
          open={open}
          onClose={() => !pending && setOpen(false)}
          title={confirm.title}
          size="sm"
          footer={
            <>
              {/* Foco inicial no caminho seguro: Enter sem querer não destrói nada. */}
              <Button variant="secondary" data-autofocus onClick={() => setOpen(false)} disabled={pending}>
                Voltar
              </Button>
              <Button variant={confirm.tone ?? (confirm.danger ? "danger" : "primary")} loading={pending} disabled={pending} onClick={run}>
                {confirm.confirmLabel}
              </Button>
            </>
          }
        >
          <div className="text-[15px] text-muted">{confirm.description}</div>
        </Dialog>
      )}
    </>
  );
}

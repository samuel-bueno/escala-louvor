"use client";

import { CheckCircle2, CircleAlert, Info } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

type ToastKind = "success" | "error" | "info";
type ToastItem = { id: number; message: string; kind: ToastKind };

const EVENT = "app:toast";

/** Dispara um toast de qualquer componente cliente. */
export function toast(message: string, kind: ToastKind = "success") {
  window.dispatchEvent(new CustomEvent<Omit<ToastItem, "id">>(EVENT, { detail: { message, kind } }));
}

/** Atalho para exibir o resultado padrão de uma server action. */
export function toastResult(res: { ok: true; message?: string } | { ok: false; error: string }, fallbackOk?: string) {
  if (res.ok) {
    if (res.message || fallbackOk) toast(res.message ?? fallbackOk!, "success");
  } else toast(res.error, "error");
}

function readFlash(): string | null {
  const m = document.cookie.match(/(?:^|; )flash=([^;]+)/);
  if (!m) return null;
  document.cookie = "flash=; Max-Age=0; path=/";
  try {
    return decodeURIComponent(decodeURIComponent(m[1]));
  } catch {
    return null;
  }
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    let n = 0;
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<Omit<ToastItem, "id">>).detail;
      const id = Date.now() + n++;
      setItems((cur) => [...cur.slice(-2), { ...detail, id }]);
      setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), detail.kind === "error" ? 6500 : 3800);
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  // Mensagens deixadas pelo servidor antes de um redirect.
  useEffect(() => {
    const msg = readFlash();
    if (msg) toast(msg, "success");
  }, [pathname, search]);

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(72px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6">
      {items.map((t) => (
        <div
          key={t.id}
          role={t.kind === "error" ? "alert" : "status"}
          className={cn(
            "anim-rise pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-lg px-3.5 py-2.5 text-[14px] font-medium shadow-[var(--shadow-pop)]",
            t.kind === "error" ? "bg-danger text-white" : "bg-fg text-bg",
          )}
        >
          {t.kind === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" /> : t.kind === "error" ? <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> : <Info className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

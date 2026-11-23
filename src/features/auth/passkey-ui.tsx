"use client";

import { Fingerprint, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { removePasskeyAction } from "@/server/actions/passkeys";
import { enablePasskey, usePasskeySupport } from "./passkey-client";

const DISMISS_KEY = "escala:passkey-prompt-dismissed";
const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};
function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/** Botão que ativa a biometria neste aparelho (usado no prompt da Home e na tela Mais). */
function EnableButton({ variant = "primary", label = "Ativar neste aparelho", onDone }: { variant?: "primary" | "secondary"; label?: string; onDone?: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant={variant}
      size="sm"
      loading={pending}
      icon={<Fingerprint className="h-4 w-4" aria-hidden />}
      onClick={() =>
        start(async () => {
          const res = await enablePasskey();
          toast(res.ok ? (res.message ?? "Ativado.") : res.error, res.ok ? "success" : "error");
          if (res.ok) {
            onDone?.();
            router.refresh();
          }
        })
      }
    >
      {label}
    </Button>
  );
}

/** Convite discreto na Home: só aparece se o aparelho tem biometria, a pessoa ainda não ativou e não dispensou. */
export function PasskeyPrompt({ hasPasskey }: { hasPasskey: boolean }) {
  const supported = usePasskeySupport();
  const dismissed = useSyncExternalStore(subscribe, readDismissed, () => true);
  const [hidden, setHidden] = useState(false);
  if (!supported || hasPasskey || dismissed || hidden) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setHidden(true);
  };
  return (
    <section aria-label="Entrar com biometria" className="mb-5 flex items-start gap-3 rounded-lg border border-border bg-surface px-3.5 py-3">
      <Fingerprint className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium">Entre só com o rosto ou a digital</p>
        <p className="text-[13px] text-muted">Ative neste aparelho e não precisa mais digitar a senha.</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <EnableButton onDone={() => setHidden(true)} />
          <Button variant="ghost" size="sm" onClick={dismiss}>
            Agora não
          </Button>
        </div>
      </div>
      <button type="button" onClick={dismiss} aria-label="Dispensar" className="-mt-1 -mr-1.5 grid h-10 w-10 shrink-0 place-items-center rounded-md text-subtle hover:bg-surface-2 hover:text-fg sm:h-8 sm:w-8">
        <X className="h-4 w-4" />
      </button>
    </section>
  );
}

export type PasskeyItem = { id: string; deviceName: string; createdAt: string; lastUsedAt: string | null };

/** Gerência na tela Mais: aparelhos com biometria, ativar neste e remover. */
export function PasskeyManager({ items }: { items: PasskeyItem[] }) {
  const supported = usePasskeySupport();
  return (
    <div className="flex flex-col gap-3">
      {items.length > 0 ? (
        <ul className="divide-y divide-border rounded-[var(--radius-card)] border border-border bg-surface">
          {items.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-1.5 pr-1.5 pl-4">
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium">{p.deviceName}</p>
                <p className="text-[12.5px] text-muted">
                  Ativado em {p.createdAt}
                  {p.lastUsedAt ? ` · último uso ${p.lastUsedAt}` : ""}
                </p>
              </div>
              <ActionButton
                size="sm"
                variant="ghost"
                action={removePasskeyAction.bind(null, p.id)}
                confirm={{ title: `Remover ${p.deviceName}?`, description: "Esse aparelho deixa de entrar com biometria. Você continua entrando com e-mail e senha.", confirmLabel: "Remover", danger: true }}
              >
                Remover
              </ActionButton>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13.5px] text-muted">Nenhum aparelho ativado. Com a biometria você entra com o rosto ou a digital, sem digitar a senha.</p>
      )}
      {supported ? <div className="self-start"><EnableButton variant="secondary" label={items.length ? "Ativar outro aparelho" : "Ativar neste aparelho"} /></div> : <p className="text-[12.5px] text-subtle">Este aparelho não tem Face ID, digital ou Windows Hello disponível. Abra o app no celular para ativar.</p>}
    </div>
  );
}

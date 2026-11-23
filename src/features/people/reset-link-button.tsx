"use client";

import { Copy, KeyRound } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { toast, toastResult } from "@/components/ui/toast";
import { createPasswordResetAction } from "@/server/actions/invites";

/** "Esqueci minha senha": o líder gera um link de uso único e envia pelo WhatsApp. */
export function ResetLinkButton({ participantId, name }: { participantId: string; name: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const create = () =>
    start(async () => {
      const res = await createPasswordResetAction(participantId);
      if (res.ok && res.data) setUrl(res.data.url.startsWith("http") ? res.data.url : `${window.location.origin}${res.data.url}`);
      else toastResult(res);
    });

  const share = async () => {
    if (!url) return;
    try {
      if (navigator.share) await navigator.share({ url, title: "Nova senha" });
      else {
        await navigator.clipboard.writeText(url);
        toast("Link copiado.");
      }
    } catch {
      /* cancelado */
    }
  };

  return (
    <>
      <Button variant="secondary" icon={<KeyRound className="h-4 w-4" aria-hidden />} loading={pending} onClick={create}>
        Link de nova senha
      </Button>
      <Dialog
        open={url !== null}
        onClose={() => setUrl(null)}
        title={`Nova senha de ${name}`}
        description="Envie este link à pessoa. Vale por 48 horas e só funciona uma vez."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setUrl(null)}>
              Fechar
            </Button>
            <Button icon={<Copy className="h-4 w-4" aria-hidden />} onClick={share}>
              Copiar / compartilhar
            </Button>
          </>
        }
      >
        <p className="rounded-xl bg-surface-2 p-3 text-sm break-all">{url}</p>
        <p className="mt-2 text-sm text-muted">Copie agora — por segurança o link não é exibido novamente.</p>
      </Dialog>
    </>
  );
}

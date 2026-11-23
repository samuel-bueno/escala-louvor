"use client";

import { Copy, Link2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { toast, toastResult } from "@/components/ui/toast";
import { createShareLinkAction, revokeShareLinkAction } from "@/server/actions/settings";

/** Link público (somente leitura) para enviar no WhatsApp: token forte, revogável e com validade. */
export function ShareLinks({ eventId, links }: { eventId: string; links: { id: string; expiresAt: string; createdAt: string }[] }) {
  const [days, setDays] = useState("14");
  const [url, setUrl] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const create = () =>
    start(async () => {
      const res = await createShareLinkAction(eventId, Number(days));
      toastResult(res);
      if (res.ok && res.data) {
        setUrl(res.data.url.startsWith("http") ? res.data.url : `${window.location.origin}${res.data.url}`);
        router.refresh();
      }
    });

  const copy = async () => {
    if (!url) return;
    try {
      if (navigator.share) await navigator.share({ url, title: "Escala" });
      else {
        await navigator.clipboard.writeText(url);
        toast("Link copiado.");
      }
    } catch {
      /* usuário cancelou o compartilhamento */
    }
  };

  return (
    <section>
      <h2 className="text-[13px] font-semibold">Compartilhar escala</h2>
      <p className="mb-3 text-[12.5px] text-muted">Link somente leitura para o grupo, sem telefone ou e-mail.</p>
      <div className="flex flex-col gap-3">
        {url ? (
          <div className="rounded-lg border border-accent/25 bg-accent-soft p-3">
            <p className="text-xs font-semibold text-muted">Copie agora — o link não é exibido novamente.</p>
            <p className="mt-1 text-sm break-all">{url}</p>
            <Button size="sm" className="mt-2" icon={<Copy className="h-4 w-4" aria-hidden />} onClick={copy}>
              Copiar / compartilhar
            </Button>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <Select label="Validade" value={days} onChange={(e) => setDays(e.target.value)} wrapperClassName="flex-1">
              <option value="3">3 dias</option>
              <option value="7">7 dias</option>
              <option value="14">14 dias</option>
              <option value="30">30 dias</option>
            </Select>
            <Button variant="secondary" onClick={create} loading={pending} icon={<Link2 className="h-4 w-4" aria-hidden />}>
              Criar link
            </Button>
          </div>
        )}
        {links.length > 0 && (
          <ul className="flex flex-col gap-2 border-t border-border pt-3">
            {links.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted">
                  Link ativo · expira {l.expiresAt}
                </span>
                <ActionButton
                  action={() => revokeShareLinkAction(l.id)}
                  variant="ghost"
                  size="sm"
                  confirm={{ title: "Revogar link?", description: "Quem tiver o endereço não conseguirá mais abrir a escala.", confirmLabel: "Revogar", danger: true }}
                >
                  Revogar
                </ActionButton>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

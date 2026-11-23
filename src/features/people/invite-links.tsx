"use client";

import { Copy, Link2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { Card, CardHeader } from "@/components/ui/primitives";
import { toast, toastResult } from "@/components/ui/toast";
import { createInviteAction, revokeInviteAction } from "@/server/actions/invites";

/** Link de convite para enviar no grupo: token forte, com validade, revogável. */
export function InviteLinks({ links }: { links: { id: string; expiresAt: string }[] }) {
  const [days, setDays] = useState("7");
  const [url, setUrl] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const create = () =>
    start(async () => {
      const res = await createInviteAction(Number(days));
      toastResult(res);
      if (res.ok && res.data) {
        setUrl(res.data.url.startsWith("http") ? res.data.url : `${window.location.origin}${res.data.url}`);
        router.refresh();
      }
    });

  const share = async () => {
    if (!url) return;
    try {
      if (navigator.share) await navigator.share({ url, title: "Cadastro no louvor" });
      else {
        await navigator.clipboard.writeText(url);
        toast("Link copiado.");
      }
    } catch {
      /* cancelado */
    }
  };

  return (
    <Card as="section">
      <CardHeader title="Link de convite" subtitle="Envie no grupo. Quem abrir preenche o cadastro e você aprova." icon={<Link2 className="h-4 w-4" />} />
      <div className="flex flex-col gap-3 p-4 sm:p-5">
        {url ? (
          <div className="rounded-xl border border-accent/25 bg-accent-soft p-3">
            <p className="text-xs font-semibold text-muted">Copie agora — o link não é exibido novamente.</p>
            <p className="mt-1 text-sm break-all">{url}</p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" icon={<Copy className="h-4 w-4" aria-hidden />} onClick={share}>
                Copiar / compartilhar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setUrl(null)}>
                Criar outro
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <Select label="Validade" value={days} onChange={(e) => setDays(e.target.value)} wrapperClassName="flex-1">
              <option value="3">3 dias</option>
              <option value="7">7 dias</option>
              <option value="14">14 dias</option>
              <option value="30">30 dias</option>
            </Select>
            <Button onClick={create} loading={pending} icon={<Link2 className="h-4 w-4" aria-hidden />}>
              Criar link
            </Button>
          </div>
        )}
        {links.length > 0 && (
          <ul className="flex flex-col gap-2 border-t border-border pt-3">
            {links.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted">Convite ativo · expira {l.expiresAt}</span>
                <ActionButton
                  action={revokeInviteAction.bind(null, l.id)}
                  variant="ghost"
                  size="sm"
                  confirm={{ title: "Revogar convite?", description: "O link deixa de funcionar. Cadastros já enviados continuam na lista para você aprovar ou recusar.", confirmLabel: "Revogar", danger: true }}
                >
                  Revogar
                </ActionButton>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

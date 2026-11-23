"use client";

import { Check, Undo2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select, Textarea } from "@/components/ui/field";
import { toastResult } from "@/components/ui/toast";
import { listSwapCandidatesAction, respondToSlotAction } from "@/server/actions/schedule";

/** Confirmar / Não posso participar / desfazer — botões grandes para uso com uma mão. */
export function SlotResponse({ slotId, status, compact }: { slotId: string; status: "pending" | "confirmed" | "declined"; compact?: boolean }) {
  const [pending, start] = useTransition();
  const [which, setWhich] = useState<string | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [suggested, setSuggested] = useState("");
  const [cands, setCands] = useState<{ id: string; name: string }[] | null>(null);
  const [loadingCands, startCands] = useTransition();
  const router = useRouter();

  const openDecline = () => {
    setDeclineOpen(true);
    setSuggested("");
    startCands(async () => {
      const res = await listSwapCandidatesAction(slotId);
      setCands(res.ok && res.data ? res.data : []);
    });
  };

  const send = (response: "confirmed" | "declined" | "pending", r?: string, suggestedParticipantId?: string) => {
    setWhich(response);
    start(async () => {
      const res = await respondToSlotAction({ slotId, response, reason: r, suggestedParticipantId: suggestedParticipantId || undefined });
      toastResult(res);
      setDeclineOpen(false);
      if (res.ok) router.refresh();
    });
  };

  if (status !== "pending") {
    return (
      <div className="flex items-center gap-2">
        <span className={status === "confirmed" ? "text-[13.5px] font-medium text-success" : "text-[13.5px] font-medium text-danger"}>
          {status === "confirmed" ? "Você confirmou" : "Troca solicitada"}
        </span>
        <Button variant="ghost" size="sm" icon={<Undo2 className="h-4 w-4" aria-hidden />} loading={pending && which === "pending"} onClick={() => send("pending")}>
          Desfazer
        </Button>
      </div>
    );
  }
  return (
    <>
      <div className={compact ? "flex gap-2" : "grid grid-cols-2 gap-2"}>
        <Button size={compact ? "sm" : "md"} icon={<Check className="h-4 w-4" aria-hidden />} loading={pending && which === "confirmed"} disabled={pending} onClick={() => send("confirmed")}>
          Confirmar
        </Button>
        <Button size={compact ? "sm" : "md"} variant="secondary" icon={<X className="h-4 w-4" aria-hidden />} disabled={pending} onClick={openDecline}>
          Preciso trocar
        </Button>
      </div>
      <Dialog
        open={declineOpen}
        onClose={() => setDeclineOpen(false)}
        title="Preciso trocar"
        description="A liderança é avisada e decide. Se souber quem pode ir no seu lugar, diga abaixo."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeclineOpen(false)}>
              Voltar
            </Button>
            <Button loading={pending} onClick={() => send("declined", reason, suggested)}>
              Pedir troca
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Select label="Quem pode ir no seu lugar?" optional value={suggested} onChange={(e) => setSuggested(e.target.value)} disabled={loadingCands} hint={cands && cands.length === 0 ? "Ninguém livre com essa função nessa data. A liderança encontra alguém." : "Só aparecem pessoas livres e com a sua função. A liderança confirma."}>
            <option value="">{loadingCands ? "Procurando…" : "Não sei, a liderança escolhe"}</option>
            {(cands ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Textarea label="Motivo" optional placeholder="Ex.: viagem, plantão…" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} hint="Visível apenas para a administração." />
        </div>
      </Dialog>
    </>
  );
}

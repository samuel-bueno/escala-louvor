"use client";

import { Ban, CheckCheck, RotateCcw, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { toastResult } from "@/components/ui/toast";
import { deleteDraftEventAction, setEventStatusAction } from "@/server/actions/events";

type Status = "draft" | "pending" | "published" | "completed" | "cancelled";

export function EventAdminActions({ eventId, status, hasWarnings, recurring }: { eventId: string; status: Status; hasWarnings: boolean; recurring?: boolean }) {
  const [pending, start] = useTransition();
  const [warnOpen, setWarnOpen] = useState(false);
  const [warnText, setWarnText] = useState("");
  const router = useRouter();

  const publish = (ignoreWarnings: boolean) =>
    start(async () => {
      const res = await setEventStatusAction(eventId, "pending", { ignoreWarnings });
      if (!res.ok && res.error.includes("Confirme para publicar")) {
        setWarnText(res.error.replace(" Confirme para publicar mesmo assim.", ""));
        setWarnOpen(true);
        return;
      }
      setWarnOpen(false);
      toastResult(res);
      if (res.ok) router.refresh();
    });

  return (
    <>
      {status === "draft" && (
        <Button size="sm" icon={<Send className="h-4 w-4" aria-hidden />} loading={pending} onClick={() => publish(false)}>
          Publicar escala
        </Button>
      )}
      {(status === "pending" || status === "published") && (
        <ActionButton
          size="sm"
          action={() => setEventStatusAction(eventId, "completed")}
          icon={<CheckCheck className="h-4 w-4" aria-hidden />}
          confirm={{ title: "Concluir compromisso?", description: "As músicas do repertório serão registradas no histórico de execução.", confirmLabel: "Concluir" }}
        >
          Concluir
        </ActionButton>
      )}
      {(status === "pending" || status === "published" || status === "completed" || status === "cancelled") && (
        <ActionButton
          size="sm"
          action={() => setEventStatusAction(eventId, "draft")}
          variant="ghost"
          icon={<RotateCcw className="h-4 w-4" aria-hidden />}
          confirm={{
            title: "Voltar para rascunho?",
            description: status === "completed" ? "O registro de execução das músicas deste culto será removido do histórico." : "A escala deixa de aparecer para a equipe até ser publicada novamente.",
            confirmLabel: "Voltar para rascunho",
          }}
        >
          {status === "cancelled" ? "Reativar" : "Voltar p/ rascunho"}
        </ActionButton>
      )}
      {status !== "cancelled" && status !== "completed" && <span aria-hidden className="mx-1 hidden h-5 w-px bg-border sm:inline-block" />}
      {status !== "cancelled" && status !== "completed" && (
        <ActionButton
          size="sm"
          action={() => setEventStatusAction(eventId, "cancelled")}
          variant="warningGhost"
          icon={<Ban className="h-4 w-4" aria-hidden />}
          confirm={{
            title: recurring ? "Cancelar só esta data?" : "Cancelar este evento?",
            description: (
              <>
                {recurring ? "Só esta data da série deixa a agenda; as outras continuam. " : "O evento sai da agenda. "}
                <strong className="font-medium text-fg">Nada é apagado:</strong> escala e repertório ficam no histórico e você pode reativar depois.
              </>
            ),
            confirmLabel: recurring ? "Cancelar esta data" : "Cancelar evento",
            tone: "primary",
          }}
        >
          Cancelar
        </ActionButton>
      )}
      {status === "draft" && !recurring && (
        <ActionButton
          size="sm"
          action={() => deleteDraftEventAction(eventId)}
          variant="dangerGhost"
          icon={<Trash2 className="h-4 w-4" aria-hidden />}
          confirm={{
            title: "Apagar este rascunho?",
            description: (
              <>
                O rascunho, as posições da escala e o repertório serão <strong className="font-medium text-danger">apagados de vez</strong>. Isso não pode ser desfeito. Para só tirar da agenda, use Cancelar.
              </>
            ),
            confirmLabel: "Apagar definitivamente",
            danger: true,
          }}
        >
          Apagar
        </ActionButton>
      )}
      <Dialog
        open={warnOpen}
        onClose={() => setWarnOpen(false)}
        title="Publicar com avisos?"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setWarnOpen(false)}>
              Revisar escala
            </Button>
            <Button loading={pending} onClick={() => publish(true)}>
              Publicar mesmo assim
            </Button>
          </>
        }
      >
        <p className="text-[14px] text-muted">{warnText || (hasWarnings ? "Existem avisos na escala." : "Existem avisos na escala.")} A equipe vai receber a escala como está.</p>
      </Dialog>
    </>
  );
}

/** Só o passo final do fluxo de escala: publicar para a equipe confirmar. */
export function PublishScheduleButton({ eventId, size = "sm", disabled }: { eventId: string; size?: "sm" | "md"; disabled?: boolean }) {
  const [pending, start] = useTransition();
  const [warnOpen, setWarnOpen] = useState(false);
  const router = useRouter();
  const [warnText, setWarnText] = useState("");
  const publish = (ignoreWarnings: boolean) =>
    start(async () => {
      const res = await setEventStatusAction(eventId, "pending", { ignoreWarnings });
      if (!res.ok && res.error.includes("Confirme para publicar")) {
        setWarnText(res.error.replace(" Confirme para publicar mesmo assim.", ""));
        setWarnOpen(true);
        return;
      }
      setWarnOpen(false);
      toastResult(res);
      if (res.ok) router.refresh();
    });
  return (
    <>
      <Button size={size} icon={<Send className="h-4 w-4" aria-hidden />} loading={pending} disabled={disabled} title={disabled ? "Escolha ao menos uma pessoa antes de publicar" : undefined} onClick={() => publish(false)}>
        Publicar escala
      </Button>
      <Dialog
        open={warnOpen}
        onClose={() => setWarnOpen(false)}
        title="Publicar com avisos?"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setWarnOpen(false)}>
              Revisar
            </Button>
            <Button loading={pending} onClick={() => publish(true)}>
              Publicar mesmo assim
            </Button>
          </>
        }
      >
        <p className="text-[14px] text-muted">{warnText || "Existem avisos na escala."} A equipe vai receber a escala como está.</p>
      </Dialog>
    </>
  );
}

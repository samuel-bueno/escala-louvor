"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/field";
import { GenerationPreview, type GenerationRequest } from "./generation-preview";

/**
 * Gera uma sugestão para UM culto: escolhe o que preencher, mostra a prévia
 * (nada é salvo antes de "Aceitar e salvar") e atualiza a página ao confirmar.
 */
export function QuickGenerate({ eventId, hasFilled, disabled }: { eventId: string; hasFilled: boolean; disabled?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<GenerationRequest["scope"]>("all");
  const [mode, setMode] = useState<GenerationRequest["mode"]>("fill-empty");
  const [request, setRequest] = useState<GenerationRequest | null>(null);

  return (
    <>
      <Button
        variant="accent"
        size="sm"
        icon={<Sparkles className="h-4 w-4" aria-hidden />}
        disabled={disabled}
        onClick={() => {
          setRequest(null);
          setOpen(true);
        }}
      >
        Gerar sugestão
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Gerar sugestão" description="Gera só para as partes que você lidera. Nada é salvo até você revisar e aceitar." size="lg">
        {!request ? (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col items-start gap-1.5">
              <p className="text-[13px] font-medium">O que preencher</p>
              <Segmented
                label="O que preencher"
                value={scope}
                onChange={setScope}
                options={[
                  { value: "all", label: "Tudo" },
                  { value: "minister", label: "Só ministro" },
                  { value: "musicians", label: "Todos menos o ministro" },
                ]}
              />
            </div>
            {hasFilled && (
              <div className="flex flex-col items-start gap-1.5">
                <p className="text-[13px] font-medium">Quem já está escalado</p>
                <Segmented
                  label="Quem já está escalado"
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: "fill-empty", label: "Manter" },
                    { value: "replace-unlocked", label: "Refazer não fixados" },
                  ]}
                />
                <p className="text-[12.5px] text-muted">{mode === "fill-empty" ? "Só as vagas em aberto recebem sugestão." : "Propõe novas pessoas para posições não fixadas; substituições pedem confirmação."}</p>
              </div>
            )}
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button icon={<Sparkles className="h-4 w-4" aria-hidden />} onClick={() => setRequest({ eventIds: [eventId], scope, mode })}>
                Ver sugestão
              </Button>
            </div>
          </div>
        ) : (
          <GenerationPreview
            request={request}
            onCancel={() => setOpen(false)}
            onApplied={() => {
              setOpen(false);
              router.refresh();
            }}
          />
        )}
      </Dialog>
    </>
  );
}

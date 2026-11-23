"use client";

import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { useFormAction } from "@/lib/use-form-action";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Segmented, Select, Textarea } from "@/components/ui/field";
import { Callout } from "@/components/ui/primitives";
import { EVENT_TYPE_LABELS } from "@/lib/validation";
import type { ActionResult } from "@/server/action-utils";
import { saveEventAction } from "@/server/actions/events";
import { plural } from "@/lib/plural";

type Fn = { id: string; name: string; kind: string };
type EventValues = {
  id?: string;
  title: string;
  type: keyof typeof EVENT_TYPE_LABELS;
  date: string;
  startTime: string;
  endTime: string | null;
  location: string | null;
  theme: string | null;
  notes: string | null;
  confirmDeadline: string | null;
  rehearsalId?: string | null;
};
type Rehearsal = { id: string; title: string; date: string; startTime: string };

export function EventForm({
  initial,
  functions,
  defaultPositions,
  rehearsals = [],
  seriesNote,
}: {
  initial: EventValues;
  functions: Fn[];
  defaultPositions: { functionId: string; count: number }[];
  rehearsals?: Rehearsal[];
  seriesNote?: string | null;
}) {
  const isNew = !initial.id;
  const { state, formProps, pending, ready, fieldErrors: fe } = useFormAction<ActionResult>(saveEventAction.bind(null, initial.id ?? null));
  const [counts, setCounts] = useState<Record<string, number>>(() => Object.fromEntries(defaultPositions.map((p) => [p.functionId, p.count])));
  const [type, setType] = useState(initial.type);
  const [repeat, setRepeat] = useState<"none" | "weekly" | "monthly">("none");
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const setCount = (id: string, n: number) => setCounts((c) => ({ ...c, [id]: Math.max(0, Math.min(10, n)) }));

  return (
    <form {...formProps} className="flex flex-col gap-5">
      {state && !state.ok && (
        <Callout tone="danger" role="alert">
          {state.error}
        </Callout>
      )}
      {seriesNote && <Callout tone="neutral">{seriesNote}</Callout>}

      <FormSection title="O quê e quando">
        <Input label="Nome" name="title" required defaultValue={initial.title} error={fe.title} placeholder="Ex.: Culto de Quarta, Vigília, Conferência" wrapperClassName="sm:col-span-2" />
        <Select label="Tipo" name="type" value={type} onChange={(e) => setType(e.target.value as EventValues["type"])} error={fe.type}>
          {Object.entries(EVENT_TYPE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
        <Input label="Data" name="date" type="date" required defaultValue={initial.date} error={fe.date} />
        <Input label="Início" name="startTime" type="time" required defaultValue={initial.startTime} error={fe.startTime} />
        <Input label="Término" name="endTime" type="time" optional defaultValue={initial.endTime ?? ""} error={fe.endTime} />
        <Input label="Local" name="location" optional defaultValue={initial.location ?? ""} error={fe.location} placeholder="Templo principal" wrapperClassName="sm:col-span-2" />
      </FormSection>

      {isNew && (
        <FormSection title="Repetição" hint="Opcional. Os domingos já são criados automaticamente.">
          <div className="flex flex-col items-start gap-1.5 sm:col-span-2">
            <span className="text-[13px] font-medium">Repetir</span>
            <Segmented
              label="Repetir"
              value={repeat}
              onChange={setRepeat}
              options={[
                { value: "none", label: "Não repetir" },
                { value: "weekly", label: "Toda semana" },
                { value: "monthly", label: "Todo mês" },
              ]}
            />
            <input type="hidden" name="repeat" value={repeat} />
          </div>
          {repeat !== "none" && (
            <Input
              label="Até"
              name="repeatUntil"
              type="date"
              required
              error={fe.repeatUntil}
              hint={repeat === "weekly" ? "Mesmo dia da semana, até esta data." : "Mesma semana do mês (ex.: 2ª sexta), até esta data."}
            />
          )}
        </FormSection>
      )}

      <FormSection title="Detalhes">
        <Input label="Tema" name="theme" optional defaultValue={initial.theme ?? ""} error={fe.theme} />
        <Input
          label="Prazo para confirmação"
          name="confirmDeadline"
          type="date"
          optional
          defaultValue={initial.confirmDeadline ?? ""}
          error={fe.confirmDeadline}
          hint="Até quando a equipe deve confirmar."
        />
        {type !== "ensaio" && (
          <Select label="Ensaio vinculado" name="rehearsalId" optional defaultValue={initial.rehearsalId ?? ""} error={fe.rehearsalId} wrapperClassName="sm:col-span-2" hint={rehearsals.length ? undefined : "Nenhum ensaio futuro cadastrado. Crie um evento do tipo Ensaio para vincular."}>
            <option value="">Sem ensaio</option>
            {rehearsals.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title} · {r.date.slice(8)}/{r.date.slice(5, 7)} {r.startTime}
              </option>
            ))}
          </Select>
        )}
        <Textarea label="Observações" name="notes" optional defaultValue={initial.notes ?? ""} error={fe.notes} wrapperClassName="sm:col-span-2" hint="Visível para quem estiver escalado." />
      </FormSection>

      {isNew && (
        <section className="border-t border-border pt-6">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <h2 className="text-[14px] font-semibold">Equipe necessária</h2>
            <span className="tabular font-mono text-[12.5px] text-muted" role="status" aria-live="polite" aria-atomic="true">{total} {plural(total, "vaga", "vagas")} no total</span>
          </div>
          <p className="mb-3 text-[13px] text-muted">
            {type === "ensaio" ? "Ensaios normalmente não precisam de posições — deixe zerado se preferir." : "Pré-preenchido com o modelo padrão. Ajuste e depois escolha as pessoas na escala."}
          </p>
          <ul className="grid grid-cols-1 divide-y divide-border rounded-[var(--radius-card)] border border-border bg-surface sm:grid-cols-2 sm:divide-y-0">
            {functions.map((f) => {
              const n = counts[f.id] ?? 0;
              return (
                <li key={f.id} className="flex items-center justify-between gap-2 px-3 py-1 sm:border-b sm:border-border sm:odd:border-r">
                  <span className={n ? "text-[14px] font-medium" : "text-[14px] text-muted"}>{f.name}</span>
                  <span className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" aria-label={`Remover uma vaga de ${f.name}`} onClick={() => setCount(f.id, n - 1)} disabled={n === 0}>
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="tabular w-6 text-center font-mono text-[14px]" aria-hidden>
                      {n}
                    </span>
                    <Button variant="ghost" size="icon" aria-label={`Adicionar uma vaga de ${f.name}`} onClick={() => setCount(f.id, n + 1)}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </span>
                  <input type="hidden" name="positionFunctionId" value={f.id} />
                  <input type="hidden" name="positionCount" value={n} />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="action-bar">
        <ButtonLink href={initial.id ? `/eventos/${initial.id}` : "/agenda"} variant="ghost" className="flex-1 sm:flex-none">
          Cancelar
        </ButtonLink>
        <Button type="submit" loading={pending} disabled={!ready} className="flex-1 sm:ml-auto sm:flex-none">
          {isNew ? (repeat === "none" ? "Criar evento" : "Criar eventos") : "Salvar alterações"}
        </Button>
      </div>
    </form>
  );
}

function FormSection({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="grid grid-cols-1 gap-6 border-t border-border pt-6 md:grid-cols-[200px_1fr]">
      <div>
        <h2 className="text-[14px] font-semibold">{title}</h2>
        {hint && <p className="mt-0.5 text-[13px] text-muted">{hint}</p>}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

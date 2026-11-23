"use client";

import { Copy, Lock, LockOpen, Plus, Save, Sparkles, StickyNote, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Segmented, Select, Toggle } from "@/components/ui/field";
import { Callout } from "@/components/ui/primitives";
import { toast, toastResult } from "@/components/ui/toast";
import { AREA_LABELS, areaOfKind, type Area } from "@/domain/permissions";
import { computeAlerts, dedupeAlerts } from "@/domain/scheduling/alerts";
import { describeCandidates } from "@/domain/scheduling/candidates";
import type { Assignment, DistributionRules, SchedParticipant } from "@/domain/scheduling/types";
import { cn } from "@/lib/cn";
import { plural } from "@/lib/plural";
import { duplicatePreviousScheduleAction } from "@/server/actions/events";
import { saveScheduleAction } from "@/server/actions/schedule";
import { AlertList } from "./alert-list";
import { ConfirmationStatus } from "./confirmation-status";
import { GenerationPreview, type GenerationRequest } from "./generation-preview";
import { PersonPicker } from "./person-picker";

type Fn = { id: string; name: string; kind: string };
export type EditorSlot = {
  id: string | null;
  functionId: string;
  participantId: string | null;
  guestName: string | null;
  locked: boolean;
  required: boolean;
  notes: string | null;
  status: "pending" | "confirmed" | "declined";
};
type Row = EditorSlot & { key: string };

let keySeq = 0;
const withKey = (s: EditorSlot): Row => ({ ...s, key: s.id ?? `new-${++keySeq}` });

const AREA_ORDER: Area[] = ["vocal", "instrumental", "other"];
const AREA_HELP: Record<Area, string> = {
  vocal: "Ministro e vocais — liderança dos vocais",
  instrumental: "Banda — liderança dos músicos",
  other: "Som, projeção — administração",
};

export function ScheduleEditor({
  event,
  functions,
  people,
  others,
  rules,
  initialSlots,
  scheduleLocked,
  readOnly,
  editableAreas,
  isAdmin,
}: {
  event: { id: string; title: string; date: string; startTime: string; endTime: string | null; status: string };
  functions: Fn[];
  people: SchedParticipant[];
  others: Assignment[];
  rules: DistributionRules;
  initialSlots: EditorSlot[];
  scheduleLocked: boolean;
  readOnly: boolean;
  editableAreas: Area[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() => initialSlots.map(withKey));
  const [locked, setLocked] = useState(scheduleLocked);
  const [dirty, setDirty] = useState(false);
  const [saving, startSave] = useTransition();
  const [dupPending, startDup] = useTransition();
  const addable = useMemo(() => functions.filter((f) => editableAreas.includes(areaOfKind(f.kind))), [functions, editableAreas]);
  const [notesOpen, setNotesOpen] = useState<string | null>(null);
  const [genOpen, setGenOpen] = useState(false);
  const [genScope, setGenScope] = useState<GenerationRequest["scope"]>("all");
  const [genMode, setGenMode] = useState<GenerationRequest["mode"]>("fill-empty");
  const [genRequest, setGenRequest] = useState<GenerationRequest | null>(null);

  // Obs.: a página monta este componente com `key` = versão dos dados do servidor,
  // então após salvar/gerar o estado é recriado a partir do banco.

  // Aviso ao sair com alterações não salvas.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const fnName = useMemo(() => Object.fromEntries(functions.map((f) => [f.id, f.name])), [functions]);
  const fnArea = useMemo(() => Object.fromEntries(functions.map((f) => [f.id, areaOfKind(f.kind)])) as Record<string, Area>, [functions]);
  const canEdit = (functionId: string) => !readOnly && editableAreas.includes(fnArea[functionId] ?? "other");
  const alerts = useMemo(
    () => computeAlerts(event, rows.map((r) => ({ id: r.key, functionId: r.functionId, participantId: r.participantId, guestName: r.guestName, required: r.required, status: r.status })), people, others, rules, fnName),
    [rows, event, people, others, rules, fnName],
  );
  // Vaga vazia já aparece na própria linha: não repete como alerta.
  const rowAlerts = (k: string) => dedupeAlerts(alerts.filter((a) => a.slotId === k && a.code !== "required-empty"));
  const blocking = dedupeAlerts(alerts.filter((a) => a.severity === "error")).length;
  const hasWarnings = dedupeAlerts(alerts.filter((a) => a.severity === "warning" && a.code !== "required-empty")).length > 0;

  const update = (key: string, patch: Partial<Row>) => {
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        const changed = next.participantId !== r.participantId || next.guestName !== r.guestName;
        return changed ? { ...next, status: next.guestName ? ("confirmed" as const) : ("pending" as const) } : next;
      }),
    );
    setDirty(true);
  };
  const remove = (key: string) => {
    setRows((rs) => rs.filter((r) => r.key !== key));
    setDirty(true);
  };
  const save = () =>
    startSave(async () => {
      const res = await saveScheduleAction({
        eventId: event.id,
        ...(isAdmin ? { scheduleLocked: locked } : {}),
        slots: rows.map((r) => ({ id: r.id, functionId: r.functionId, participantId: r.participantId, guestName: r.guestName, locked: r.locked, required: r.required, notes: r.notes })),
      });
      toastResult(res);
      if (res.ok) {
        setDirty(false);
        router.refresh();
      }
    });

  const openGenerator = () => {
    if (dirty) {
      toast("Salve as alterações antes de gerar automaticamente.", "error");
      return;
    }
    setGenRequest(null);
    setGenOpen(true);
  };

  const filled = (rs: Row[]) => rs.filter((r) => r.participantId || r.guestName).length;
  const kindOrder: Record<string, number> = { minister: 0, vocal: 1, instrument: 2, tech: 3 };
  const kindOf = (fid: string) => functions.find((f) => f.id === fid)?.kind ?? "tech";
  const byArea = AREA_ORDER.map((area) => ({
    area,
    rows: rows.filter((r) => fnArea[r.functionId] === area).sort((a, b) => (kindOrder[kindOf(a.functionId)] ?? 9) - (kindOrder[kindOf(b.functionId)] ?? 9)),
  }))
    .filter((g) => g.rows.length > 0 || editableAreas.includes(g.area))
    // As áreas que você edita vêm primeiro; as outras ficam abaixo, só para consulta.
    .sort((a, b) => Number(editableAreas.includes(b.area)) - Number(editableAreas.includes(a.area)));
  const canGenerate = !readOnly && !locked && editableAreas.length > 0;
  const canEditAny = !readOnly && editableAreas.length > 0;

  return (
    <div className="flex flex-col gap-6">
      {readOnly && (
        <Callout tone="warning" title="Escala somente leitura">
          Compromissos cancelados ou concluídos não podem ter a escala alterada. Reative ou volte para rascunho para editar.
        </Callout>
      )}

      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[14px] font-medium">
            <span className="tabular font-mono">
              {filled(rows)}/{rows.length}
            </span>{" "}
            {plural(rows.length, "posição preenchida", "posições preenchidas")}
          </p>
          <p className="text-[13px] text-muted">
            {blocking ? `${plural(blocking, "erro bloqueia", "erros bloqueiam")} a publicação` : hasWarnings ? "Há avisos — você pode publicar mesmo assim" : "Sem conflitos"}
          </p>
        </div>
        {canEditAny && (
          <div className="flex flex-wrap gap-2">
            {canGenerate && (
              <Button variant="accent" size="sm" icon={<Sparkles className="h-4 w-4" aria-hidden />} onClick={openGenerator}>
                Gerar sugestão
              </Button>
            )}
            {isAdmin && filled(rows) === 0 && (
              <Button
                variant="secondary"
                size="sm"
                icon={<Copy className="h-4 w-4" aria-hidden />}
                loading={dupPending}
                onClick={() =>
                  startDup(async () => {
                    const res = await duplicatePreviousScheduleAction(event.id);
                    toastResult(res);
                    if (res.ok) router.refresh();
                  })
                }
              >
                Duplicar anterior
              </Button>
            )}
          </div>
        )}
      </div>

      {editableAreas.length < 2 && !readOnly && (
        <p className="text-[13px] text-muted">
          Você edita {editableAreas.length ? <span className="text-fg-2">{editableAreas.map((a) => AREA_LABELS[a].toLowerCase()).join(" e ")}</span> : "nenhuma parte"}. As outras áreas aparecem só para consulta.
        </p>
      )}

      {rows.length === 0 && <Callout tone="info">Nenhuma posição ainda. Adicione abaixo as funções necessárias (ex.: Ministro, Violão, Bateria).</Callout>}

      {byArea.map(({ area, rows: areaRows }) => {
        const editable = !readOnly && editableAreas.includes(area);
        return (
          <section key={area} aria-labelledby={`area-${area}`}>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
              <h2 id={`area-${area}`} className="text-[13px] font-semibold">
                {AREA_LABELS[area]}
                <span className="tabular ml-2 font-mono text-[12px] font-normal text-muted">
                  {filled(areaRows)}/{areaRows.length}
                </span>
              </h2>
              <p className="text-[12px] text-muted">{editable ? AREA_HELP[area] : <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" aria-hidden /> somente leitura · {AREA_HELP[area].split("— ")[1] ?? "outra liderança"}</span>}</p>
            </div>
            {areaRows.length > 0 && (
              <ul className="divide-y divide-border rounded-[var(--radius-card)] border border-border bg-surface">
                {areaRows.map((r) => {
                  const ra = rowAlerts(r.key);
                  const taken = new Set(rows.filter((x) => x.key !== r.key && x.participantId).map((x) => x.participantId!));
                  const cands = describeCandidates(people, r.functionId, event, others, rules, taken);
                  const options = cands.filter((c) => c.compatible).map((c) => ({ id: c.id, name: c.name, monthCount: c.monthCount, issues: c.issues }));
                  const current = r.participantId ? people.find((p) => p.id === r.participantId) : null;
                  const rowEditable = canEdit(r.functionId);
                  const hasError = ra.some((a) => a.severity === "error");
                  return (
                    <li key={r.key} className={cn("px-3 py-3 sm:px-4", hasError && "bg-danger-soft/40")}>
                      <div className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1.5 sm:flex sm:gap-3">
                        <div className="order-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 sm:w-52 sm:shrink-0">
                          {r.id ? (
                            <p className="text-[13.5px] font-medium text-fg-2">{fnName[r.functionId]}</p>
                          ) : (
                            <Select aria-label="Função da posição" value={r.functionId} disabled={!rowEditable} onChange={(e) => update(r.key, { functionId: e.target.value })} className="h-11 border-transparent bg-surface-2 font-medium">
                              {addable.map((f) => (
                                <option key={f.id} value={f.id}>
                                  {f.name}
                                </option>
                              ))}
                            </Select>
                          )}
                          {(r.participantId || r.guestName) && event.status !== "draft" && !r.guestName && <ConfirmationStatus status={r.status} />}
                        </div>
                        <div className="order-3 col-span-2 min-w-0 sm:order-2 sm:col-span-1 sm:flex-1">
                          <PersonPicker
                            functionName={fnName[r.functionId]}
                            options={options}
                            value={r.participantId}
                            guestName={r.guestName}
                            currentName={current?.name}
                            disabled={!rowEditable || r.locked}
                            onSelect={(id) => update(r.key, { participantId: id, guestName: null })}
                            onGuest={(name) => update(r.key, { participantId: null, guestName: name })}
                          />
                          {options.length === 0 && !r.guestName && <p className="mt-1 text-[12.5px] text-warning">Ninguém ativo tem {fnName[r.functionId]} cadastrado.</p>}
                        </div>
                        <div className="order-2 flex items-center sm:order-3 sm:shrink-0">
                          <Button
                            variant={r.locked ? "soft" : "ghost"}
                            size="icon"
                            disabled={!rowEditable}
                            aria-pressed={r.locked}
                            aria-label={r.locked ? `Desafixar ${fnName[r.functionId]} (permitir que a geração altere)` : `Fixar ${fnName[r.functionId]} (a geração não altera)`}
                            title={r.locked ? "Fixado" : "Fixar"}
                            onClick={() => update(r.key, { locked: !r.locked })}
                          >
                            {r.locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
                          </Button>
                          <Button variant={r.notes ? "soft" : "ghost"} size="icon" disabled={!rowEditable} aria-label={`Observação de ${fnName[r.functionId]}`} onClick={() => setNotesOpen(r.key)}>
                            <StickyNote className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" disabled={!rowEditable || r.locked} aria-label={`Remover posição ${fnName[r.functionId]}`} onClick={() => remove(r.key)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      {r.locked && (
                        <p className="mt-1.5 text-[12px] text-muted">
                          <Lock className="mr-1 inline h-3 w-3" aria-hidden />
                          Fixado — a geração automática não altera esta posição
                        </p>
                      )}
                      {r.guestName && <p className="mt-1.5 text-[12px] text-muted">Convidado de fora — sem cadastro e sem confirmação pelo app.</p>}
                      {r.notes && <p className="mt-1.5 text-[12.5px] text-muted">Obs.: {r.notes}</p>}
                      {ra.length > 0 && (
                        <div className="mt-2.5">
                          <AlertList alerts={ra} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {editable && addable.some((f) => fnArea[f.id] === area) && (
              <AddPosition area={area} functions={addable.filter((f) => fnArea[f.id] === area)} onAdd={(fid) => {
                setRows((rs) => [...rs, withKey({ id: null, functionId: fid, participantId: null, guestName: null, locked: false, required: true, notes: null, status: "pending" })]);
                setDirty(true);
              }} />
            )}
          </section>
        );
      })}

      {isAdmin && !readOnly && (
        <div className="border-t border-border pt-2">
          <Toggle
            label="Bloquear escala inteira"
            description="A geração automática não altera nenhuma posição deste compromisso."
            checked={locked}
            onChange={(e) => {
              setLocked(e.target.checked);
              setDirty(true);
            }}
          />
        </div>
      )}

      {canEditAny && (
        <div className="action-bar">
          <span className="flex-1 text-[13px] text-muted" role="status">
            {dirty ? "Alterações não salvas" : "Tudo salvo"}
          </span>
          <Button icon={<Save className="h-4 w-4" aria-hidden />} loading={saving} disabled={!dirty} onClick={save}>
            Salvar escala
          </Button>
        </div>
      )}

      <Dialog open={notesOpen !== null} onClose={() => setNotesOpen(null)} title="Observação da posição" size="sm" footer={<Button onClick={() => setNotesOpen(null)}>Pronto</Button>}>
        {notesOpen && (
          <textarea
            className="min-h-28 w-full rounded-lg border border-border-strong bg-surface p-3"
            aria-label="Observação"
            maxLength={300}
            defaultValue={rows.find((r) => r.key === notesOpen)?.notes ?? ""}
            onChange={(e) => update(notesOpen, { notes: e.target.value || null })}
            placeholder="Ex.: levar pedal de efeitos, chegar às 18h…"
          />
        )}
      </Dialog>

      <Dialog open={genOpen} onClose={() => setGenOpen(false)} title="Gerar sugestão" description="Gera só para as partes que você lidera. Nada é salvo até você aceitar a prévia." size="lg">
        {!genRequest ? (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col items-start gap-1.5">
              <p className="text-[13px] font-medium">O que preencher</p>
              <Segmented
                label="O que preencher"
                value={genScope}
                onChange={setGenScope}
                options={[
                  { value: "all", label: "Tudo" },
                  { value: "minister", label: "Só ministro" },
                  { value: "musicians", label: "Todos menos o ministro" },
                ]}
              />
            </div>
            <div className="flex flex-col items-start gap-1.5">
              <p className="text-[13px] font-medium">Posições já preenchidas</p>
              <Segmented
                label="Posições já preenchidas"
                value={genMode}
                onChange={setGenMode}
                options={[
                  { value: "fill-empty", label: "Manter (recomendado)" },
                  { value: "replace-unlocked", label: "Refazer não fixadas" },
                ]}
              />
              <p className="text-[12.5px] text-muted">{genMode === "fill-empty" ? "Só as vagas em aberto recebem sugestão." : "Propõe novas pessoas; substituições pedem confirmação. Vagas de convidado nunca mudam."}</p>
            </div>
            <div className="flex justify-end">
              <Button icon={<Sparkles className="h-4 w-4" aria-hidden />} onClick={() => setGenRequest({ eventIds: [event.id], scope: genScope, mode: genMode })}>
                Ver sugestão
              </Button>
            </div>
          </div>
        ) : (
          <GenerationPreview
            request={genRequest}
            onCancel={() => setGenOpen(false)}
            onApplied={() => {
              setGenOpen(false);
              router.refresh();
            }}
          />
        )}
      </Dialog>

      {rows.some((r) => r.status === "declined") && <p className="text-[13px] text-danger">Há recusas: substitua as pessoas marcadas como “Recusou”.</p>}
    </div>
  );
}

function AddPosition({ area, functions, onAdd }: { area: Area; functions: Fn[]; onAdd: (functionId: string) => void }) {
  const [fid, setFid] = useState(functions[0]?.id ?? "");
  return (
    <div className="mt-2 flex items-center gap-2">
      <Select aria-label={`Adicionar posição em ${AREA_LABELS[area]}`} value={fid} onChange={(e) => setFid(e.target.value)} wrapperClassName="flex-1 sm:max-w-60" className="h-11 sm:h-9">
        {functions.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </Select>
      <Button variant="secondary" size="sm" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => fid && onAdd(fid)}>
        Adicionar
      </Button>
    </div>
  );
}

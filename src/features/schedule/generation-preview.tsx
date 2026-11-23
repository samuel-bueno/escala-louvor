"use client";

import { ChevronDown, Lock, LockOpen, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/field";
import { Badge, Callout, Skeleton } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { formatDayMonth, weekdayName } from "@/domain/dates";
import type { Proposal } from "@/domain/scheduling/types";
import { cn } from "@/lib/cn";
import { applyGenerationAction, previewGenerationAction, type PreviewData } from "@/server/actions/schedule";
import { plural } from "@/lib/plural";

export interface GenerationRequest {
  eventIds: string[];
  scope: "minister" | "musicians" | "all";
  mode: "fill-empty" | "replace-unlocked";
  excludedIds?: string[];
  eligibleIds?: string[];
  maxPerPerson?: number | null;
}

/**
 * PRÉVIA da geração: nada é salvo até "Aceitar e salvar".
 * Permite trocar pessoas, fixar, gerar novamente (mantendo seus ajustes) e cancelar.
 */
export function GenerationPreview({ request, onApplied, onCancel }: { request: GenerationRequest; onApplied: () => void; onCancel: () => void }) {
  const [data, setData] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string | null>>({});
  const [locks, setLocks] = useState<Set<string>>(new Set());
  const [loading, startLoad] = useTransition();
  const [applying, startApply] = useTransition();
  const [confirmReplace, setConfirmReplace] = useState<string | null>(null);
  const [openWhy, setOpenWhy] = useState<string | null>(null);

  const load = useCallback(
    (pins: Record<string, string | null>) =>
      startLoad(async () => {
        setError(null);
        const res = await previewGenerationAction({ ...request, excludedIds: request.excludedIds ?? [], eligibleIds: request.eligibleIds ?? [], maxPerPerson: request.maxPerPerson ?? null, pins, seed: null });
        if (res.ok && res.data) setData(res.data);
        else if (!res.ok) setError(res.error);
      }),
    [request],
  );

  useEffect(() => {
    load({});
  }, [load]);

  const people = useMemo(() => new Map((data?.people ?? []).map((p) => [p.id, p])), [data]);
  const finalOf = (p: Proposal) => (Object.prototype.hasOwnProperty.call(edits, p.slotId) ? edits[p.slotId] : p.participantId);

  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const p of data?.proposals ?? []) {
      const who = Object.prototype.hasOwnProperty.call(edits, p.slotId) ? edits[p.slotId] : p.participantId;
      if (who) c.set(who, (c.get(who) ?? 0) + 1);
    }
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [data, edits]);

  const changes = () =>
    (data?.proposals ?? [])
      .filter((p) => p.source !== "fixed" || Object.prototype.hasOwnProperty.call(edits, p.slotId) || locks.has(p.slotId))
      .map((p) => ({ slotId: p.slotId, previousParticipantId: p.previousParticipantId, participantId: finalOf(p), lock: locks.has(p.slotId), auto: !Object.prototype.hasOwnProperty.call(edits, p.slotId) }));

  const apply = (confirm: boolean) =>
    startApply(async () => {
      const res = await applyGenerationAction({ changes: changes(), confirmReplace: confirm });
      if (!res.ok) {
        if (res.error.includes("Confirme a substituição")) setConfirmReplace(res.error);
        else toast(res.error, "error");
        return;
      }
      setConfirmReplace(null);
      toast(res.message ?? "Escala salva.");
      onApplied();
    });

  if (error)
    return (
      <div className="flex flex-col gap-3">
        <Callout tone="danger" role="alert">
          {error}
        </Callout>
        <Button variant="secondary" onClick={onCancel}>
          Fechar
        </Button>
      </div>
    );

  if (!data)
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Gerando prévia">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    );

  const generated = data.proposals.filter((p) => p.source === "generated").length;
  const empty = data.proposals.filter((p) => !finalOf(p)).length;
  const replacing = data.proposals.filter((p) => p.previousParticipantId && finalOf(p) !== p.previousParticipantId).length;

  return (
    <div className={cn("flex flex-col gap-4", loading && "pointer-events-none opacity-60")}>
      <div className="flex flex-wrap gap-2">
        <Badge tone="primary">{generated} {plural(generated, "sugerida", "sugeridas")}</Badge>
        {empty > 0 && <Badge tone="warning">{empty} {plural(empty, "vaga", "vagas")} sem candidato</Badge>}
        {replacing > 0 && <Badge tone="danger">{replacing} {plural(replacing, "substituição", "substituições")}</Badge>}
        <Badge tone="neutral">{data.events.length} {plural(data.events.length, "compromisso", "compromissos")}</Badge>
      </div>

      {data.warnings.length > 0 && (
        <Callout tone="warning" title="Atenção">
          <ul className="list-disc pl-4">
            {data.warnings.slice(0, 8).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
            {data.warnings.length > 8 && <li>… e mais {data.warnings.length - 8}.</li>}
          </ul>
          <p className="mt-1">Vagas sem candidato ficam vazias — resolva manualmente.</p>
        </Callout>
      )}

      {counts.length > 0 && (
        <details className="border-y border-border py-1">
          <summary className="flex min-h-9 items-center text-[13px] font-medium">Distribuição no período</summary>
          <div className="mt-2 flex flex-wrap gap-1.5 pb-1">
            {counts.map(([id, n]) => (
              <Badge key={id} tone="neutral">
                {people.get(id)?.name ?? "—"} · {n}
              </Badge>
            ))}
          </div>
        </details>
      )}

      <div className="flex flex-col gap-4">
        {data.events.map((ev) => {
          const props = data.proposals.filter((p) => p.eventId === ev.id);
          return (
            <section key={ev.id} className="overflow-hidden rounded-[var(--radius-card)] border border-border">
              <h3 className="flex items-baseline justify-between gap-2 border-b border-border bg-surface-2/60 px-3.5 py-2">
                <span className="font-mono text-[13px] font-medium">
                  {weekdayName(ev.date)} {formatDayMonth(ev.date)}
                </span>
                <span className="truncate text-[13px] text-muted">
                  {ev.title} · {ev.startTime}
                </span>
              </h3>
              <ul className="divide-y divide-border">
                {props.map((p) => {
                  const slot = ev.slots.find((s) => s.id === p.slotId)!;
                  const who = finalOf(p);
                  const edited = Object.prototype.hasOwnProperty.call(edits, p.slotId);
                  const fixed = p.source === "fixed" && slot.locked;
                  const compatible = data.people.filter((x) => x.functionIds.includes(p.functionId));
                  const replaced = p.previousParticipantId && who !== p.previousParticipantId;
                  return (
                    <li key={p.slotId} className="px-3.5 py-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <span className="text-[13px] text-muted sm:w-36 sm:shrink-0">{slot.functionName}</span>
                        <div className="min-w-0 flex-1">
                          {slot.guestName ? (
                            <p className="flex h-11 items-center gap-2 text-[14px] sm:h-9">
                              <span className="font-medium">{slot.guestName}</span>
                              <span className="text-[12px] text-muted">convidado · não é alterado pela geração</span>
                            </p>
                          ) : (
                          <Select
                            aria-label={`${slot.functionName} em ${formatDayMonth(ev.date)}`}
                            value={who ?? ""}
                            disabled={fixed}
                            onChange={(e) => setEdits((cur) => ({ ...cur, [p.slotId]: e.target.value || null }))}
                            className={cn("h-11 sm:h-9", !who && "text-warning")}
                          >
                            <option value="">— Vaga em aberto —</option>
                            {compatible.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                                {c.unavailableDates.includes(ev.date) ? " — indisponível" : ""}
                              </option>
                            ))}
                          </Select>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <SourceBadge p={p} edited={edited} fixed={fixed} />
                          {!fixed && (
                            <Button
                              variant={locks.has(p.slotId) ? "soft" : "ghost"}
                              size="icon"
                              aria-pressed={locks.has(p.slotId)}
                              aria-label={locks.has(p.slotId) ? "Não fixar ao salvar" : "Fixar ao salvar"}
                              onClick={() =>
                                setLocks((cur) => {
                                  const n = new Set(cur);
                                  if (n.has(p.slotId)) n.delete(p.slotId);
                                  else n.add(p.slotId);
                                  return n;
                                })
                              }
                            >
                              {locks.has(p.slotId) ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" aria-expanded={openWhy === p.slotId} onClick={() => setOpenWhy(openWhy === p.slotId ? null : p.slotId)}>
                            Por quê?
                            <ChevronDown className={cn("h-4 w-4 transition-transform", openWhy === p.slotId && "rotate-180")} aria-hidden />
                          </Button>
                        </div>
                      </div>
                      {replaced && <p className="mt-1 text-[12px] text-danger">Substitui {people.get(p.previousParticipantId!)?.name ?? "pessoa atual"}</p>}
                      {openWhy === p.slotId && (
                        <div className="anim-rise mt-2 rounded-lg bg-surface-2 p-3 text-[13px]">
                          <p>{p.reason}</p>
                          {p.rejected.length > 0 && (
                            <ul className="mt-2 space-y-0.5 text-muted">
                              {p.rejected.slice(0, 8).map((r) => (
                                <li key={r.participantId}>
                                  <span className="font-medium text-fg">{r.name}</span>: {r.reason}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      <div className="safe-bottom sticky bottom-0 -mx-5 -mb-4 flex flex-col gap-2 border-t border-border bg-surface px-5 py-3 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onCancel} disabled={applying}>
          Cancelar
        </Button>
        <Button variant="secondary" icon={<RefreshCw className="h-4 w-4" aria-hidden />} loading={loading} onClick={() => load(edits)}>
          Gerar novamente
        </Button>
        <Button icon={<Sparkles className="h-4 w-4" aria-hidden />} loading={applying} onClick={() => apply(false)}>
          Aceitar e salvar
        </Button>
      </div>

      <Dialog
        open={confirmReplace !== null}
        onClose={() => setConfirmReplace(null)}
        title="Substituir pessoas já escaladas?"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmReplace(null)}>
              Voltar à prévia
            </Button>
            <Button variant="danger" loading={applying} onClick={() => apply(true)}>
              Substituir e salvar
            </Button>
          </>
        }
      >
        <p className="text-[15px] text-muted">{confirmReplace} As pessoas substituídas voltam a ficar livres, e a confirmação da nova pessoa fica pendente.</p>
      </Dialog>
    </div>
  );
}

function SourceBadge({ p, edited, fixed }: { p: Proposal; edited: boolean; fixed: boolean }) {
  if (edited) return <Badge tone="accent">Ajustado</Badge>;
  if (fixed) return <Badge tone="primary" icon={<Lock className="h-3 w-3" aria-hidden />}>Fixado</Badge>;
  if (p.source === "fixed") return <Badge tone="neutral">Mantido</Badge>;
  if (p.source === "empty") return <Badge tone="warning">Sem candidato</Badge>;
  return <Badge tone="success">Sugerido</Badge>;
}

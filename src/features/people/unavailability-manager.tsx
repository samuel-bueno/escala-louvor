"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Callout } from "@/components/ui/primitives";
import { toastResult } from "@/components/ui/toast";
import { formatDate, weekdayShort } from "@/domain/dates";
import type { ActionResult } from "@/server/action-utils";
import { useHydrated } from "@/lib/use-form-action";
import { addUnavailabilityAction, removeUnavailabilityAction } from "@/server/actions/participants";
import { plural } from "@/lib/plural";

type Row = { id: string; startDate: string; endDate: string; reason: string | null };

/** "Quando você não pode servir?" — lista simples de datas/períodos. */
export function UnavailabilityManager({ participantId, rows, today }: { participantId: string; rows: Row[]; today: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const [removing, setRemoving] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // Até >= De, revalidado a cada mudança (o servidor valida de novo).
  const rangeInvalid = Boolean(from && to && to < from);
  const RANGE_MSG = "A data final precisa ser igual ou posterior à data inicial.";
  const ready = useHydrated();
  const upcoming = rows.filter((r) => r.endDate >= today);
  const past = rows.filter((r) => r.endDate < today);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (rangeInvalid) return;
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await addUnavailabilityAction(undefined, fd);
      setError(res.ok ? null : res);
      toastResult(res);
      if (res.ok) {
        formRef.current?.reset();
        setFrom("");
        setTo("");
        router.refresh();
      }
    });
  };
  const remove = (id: string) => {
    setRemoving(id);
    start(async () => {
      const res = await removeUnavailabilityAction(id);
      toastResult(res);
      setRemoving(null);
      if (res.ok) router.refresh();
    });
  };
  const fe = error && !error.ok ? (error.fieldErrors ?? {}) : {};

  const renderRow = (r: Row) => (
    <li key={r.id} className="flex items-center gap-3 py-1.5 pr-1.5 pl-4">
      <span aria-hidden className="font-mono text-[13px] text-danger">×</span>
      <div className="min-w-0 flex-1">
        <p className="tabular font-mono text-[13px]">
          {r.startDate === r.endDate ? `${weekdayShort(r.startDate)}, ${formatDate(r.startDate)}` : `${formatDate(r.startDate)} até ${formatDate(r.endDate)}`}
        </p>
        {r.reason && <p className="truncate text-[12.5px] text-muted">{r.reason}</p>}
      </div>
      <Button variant="ghost" size="icon" aria-label={`Remover indisponibilidade de ${r.startDate === r.endDate ? formatDate(r.startDate) : `${formatDate(r.startDate)} a ${formatDate(r.endDate)}`}`} loading={pending && removing === r.id} onClick={() => remove(r.id)}>
        {!(pending && removing === r.id) && <Trash2 className="h-4 w-4" />}
      </Button>
    </li>
  );

  return (
    <div className="flex flex-col gap-4">
      <form ref={formRef} onSubmit={submit} method="post" className="grid grid-cols-2 gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:items-end" noValidate>
        <input type="hidden" name="participantId" value={participantId} />
        <Input label="De" name="startDate" type="date" required min={today} value={from} onChange={(e) => setFrom(e.target.value)} error={fe.startDate} />
        <Input label="Até" name="endDate" type="date" optional min={from || today} value={to} onChange={(e) => setTo(e.target.value)} error={rangeInvalid ? RANGE_MSG : fe.endDate} />
        <Input label="Motivo" name="reason" optional maxLength={200} placeholder="Viagem, trabalho…" error={fe.reason} wrapperClassName="col-span-2" />
        <Button type="submit" className="col-span-2 sm:col-span-1 sm:justify-self-start" icon={<Plus className="h-4 w-4" aria-hidden />} loading={pending && !removing} disabled={!ready || rangeInvalid}>
          Informar ausência
        </Button>
      </form>
      {error && !error.ok && !Object.keys(fe).length && <Callout tone="danger">{error.error}</Callout>}
      <p className="text-[12.5px] text-muted">Deixe &quot;Até&quot; vazio para um único dia. O motivo é visível apenas para você e a liderança.</p>
      {upcoming.length === 0 ? (
        <p className="text-[13.5px] text-muted">Nenhuma ausência futura informada.</p>
      ) : (
        <ul className="divide-y divide-border rounded-[var(--radius-card)] border border-border bg-surface">{upcoming.map(renderRow)}</ul>
      )}
      {past.length > 0 && (
        <div>
          <button type="button" className="link-action" onClick={() => setShowPast(!showPast)} aria-expanded={showPast}>
            {showPast ? "Ocultar anteriores" : `Ver ${past.length} ${plural(past.length, "anterior", "anteriores")}`}
          </button>
          {showPast && <ul className="mt-2 divide-y divide-border rounded-[var(--radius-card)] border border-border bg-surface opacity-70">{past.map(renderRow)}</ul>}
        </div>
      )}
    </div>
  );
}

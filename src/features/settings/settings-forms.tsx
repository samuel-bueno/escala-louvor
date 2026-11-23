"use client";

import { CalendarPlus, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select, Toggle } from "@/components/ui/field";
import { Callout } from "@/components/ui/primitives";
import { toast, toastResult } from "@/components/ui/toast";
import { addDays, addMonths, WEEKDAY_NAMES } from "@/domain/dates";
import { useFormAction } from "@/lib/use-form-action";
import { EVENT_TYPE_LABELS } from "@/lib/validation";
import type { ActionResult } from "@/server/action-utils";
import { createFromRecurrenceAction, updateSeriesAction } from "@/server/actions/events";
import { deleteCategoryAction, saveCategoryAction } from "@/server/actions/songs";
import { deleteRecurrenceAction, saveRecurrenceAction, saveSettingsAction } from "@/server/actions/settings";
import { plural } from "@/lib/plural";

type Settings = {
  avoidConsecutive: boolean;
  defaultMonthlyLimit: number;
  limitMode: "hard" | "soft";
  minIntervalDays: number;
  prioritizeLess: boolean;
  songMinIntervalDays: number;
  defaultSongCount: number;
  defaultPositions: { functionId: string; count: number }[];
};

export function DistributionForm({ settings, functions }: { settings: Settings; functions: { id: string; name: string }[] }) {
  const router = useRouter();
  const { state, formProps, pending, ready, fieldErrors: fe } = useFormAction<ActionResult>(async (prev, fd) => {
    const res = await saveSettingsAction(prev, fd);
    toastResult(res);
    if (res.ok) router.refresh();
    return res;
  });
  return (
    <form {...formProps} className="flex flex-col gap-4">
      {state && !state.ok && <Callout tone="danger">{state.error}</Callout>}
      <div className="divide-y divide-border">
        <Toggle name="avoidConsecutive" defaultChecked={settings.avoidConsecutive} label="Evitar participações consecutivas" description="Tenta não escalar a mesma pessoa em cultos seguidos." />
        <Toggle name="prioritizeLess" defaultChecked={settings.prioritizeLess} label="Priorizar quem participou menos" description="Quem serviu menos no mês tem preferência." />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Input label="Máximo de escalas por mês" name="defaultMonthlyLimit" type="number" inputMode="numeric" min={1} max={31} defaultValue={settings.defaultMonthlyLimit} error={fe.defaultMonthlyLimit} hint="Cada pessoa pode ter um limite próprio." />
        <Select label="Respeitar o limite como" name="limitMode" defaultValue={settings.limitMode}>
          <option value="hard">Obrigatório</option>
          <option value="soft">Preferência</option>
        </Select>
        <Input label="Intervalo mínimo (dias)" name="minIntervalDays" type="number" inputMode="numeric" min={0} max={60} defaultValue={settings.minIntervalDays} error={fe.minIntervalDays} />
      </div>
      <h3 className="pt-2 text-[13px] font-semibold">Repertório</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Músicas por culto (padrão)" name="defaultSongCount" type="number" inputMode="numeric" min={1} max={15} defaultValue={settings.defaultSongCount} error={fe.defaultSongCount} />
        <Input label="Intervalo para repetir música (dias)" name="songMinIntervalDays" type="number" inputMode="numeric" min={0} max={365} defaultValue={settings.songMinIntervalDays} error={fe.songMinIntervalDays} />
      </div>
      <h3 className="pt-2 text-[13px] font-semibold">Posições padrão de um culto</h3>
      <p className="-mt-2 text-[13px] text-muted">Usadas ao criar cultos (manualmente ou pela recorrência).</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {functions.map((f) => (
          <label key={f.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-[13.5px]">
            {f.name}
            <input type="hidden" name="positionFunctionId" value={f.id} />
            <input
              name="positionCount"
              type="number"
              inputMode="numeric"
              min={0}
              max={10}
              aria-label={`Quantidade de ${f.name}`}
              defaultValue={settings.defaultPositions.find((p) => p.functionId === f.id)?.count ?? 0}
              className="h-9 w-14 rounded-md border border-border-strong bg-surface text-center font-mono sm:h-8"
            />
          </label>
        ))}
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={pending} disabled={!ready}>
          Salvar regras
        </Button>
      </div>
    </form>
  );
}

type Rule = { id: string; title: string; type: keyof typeof EVENT_TYPE_LABELS; description: string; startTime: string; endTime: string | null; location: string | null; active: boolean; isSundaySeries: boolean };

export function RecurrenceManager({ rules, today }: { rules: Rule[]; today: string }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [genFor, setGenFor] = useState<Rule | null>(null);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [months, setMonths] = useState("3");
  const [pending, start] = useTransition();
  const { state, formProps: recFormProps, pending: saving, ready: recReady, fieldErrors: fe } = useFormAction<ActionResult>(async (prev, fd) => {
    const res = await saveRecurrenceAction(prev, fd);
    toastResult(res);
    if (res.ok) {
      setCreating(false);
      router.refresh();
    }
    return res;
  });

  const generate = () =>
    start(async () => {
      if (!genFor) return;
      const res = await createFromRecurrenceAction(genFor.id, today, addDays(addMonths(today, Number(months)), -1));
      toastResult(res);
      if (res.ok) {
        setGenFor(null);
        router.refresh();
      }
    });

  return (
    <div className="flex flex-col gap-3">
      {rules.length === 0 && <p className="text-[13.5px] text-muted">Nenhuma série. Ex.: Ensaio toda quinta às 20:00.</p>}
      <ul className="divide-y divide-border rounded-[var(--radius-card)] border border-border bg-surface">
        {rules.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-[14px] font-medium">
                {r.title}
                {r.isSundaySeries && <span className="text-[12px] font-normal text-muted">automática até 31/12/2027</span>}
                {!r.active && <span className="text-[12px] font-normal text-warning">pausada</span>}
              </p>
              <p className="text-[13px] text-muted">
                {r.description} · <span className="font-mono text-[12.5px]">{r.startTime}{r.endTime ? `–${r.endTime}` : ""}</span> · {EVENT_TYPE_LABELS[r.type]}
                {r.location && <> · {r.location}</>}
              </p>
            </div>
            <Button size="sm" variant="secondary" icon={<Pencil className="h-4 w-4" aria-hidden />} onClick={() => setEditing(r)}>
              Editar série
            </Button>
            {!r.isSundaySeries && (
              <Button size="sm" variant="ghost" icon={<CalendarPlus className="h-4 w-4" aria-hidden />} onClick={() => setGenFor(r)}>
                Criar datas
              </Button>
            )}
            {!r.isSundaySeries && <ActionButton
              action={() => deleteRecurrenceAction(r.id)}
              variant="ghost"
              size="sm"
              icon={<Trash2 className="h-4 w-4" aria-hidden />}
              confirm={{ title: "Remover recorrência?", description: "Os compromissos já criados continuam na agenda.", confirmLabel: "Remover", danger: true }}
            >
              <span className="sr-only">Remover {r.title}</span>
            </ActionButton>}
          </li>
        ))}
      </ul>
      <Button variant="secondary" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setCreating(true)} className="self-start">
        Nova série
      </Button>

      {editing && <SeriesDialog rule={editing} onClose={() => setEditing(null)} />}

      <Dialog open={creating} onClose={() => setCreating(false)} title="Nova recorrência" size="md">
        <form {...recFormProps} className="flex flex-col gap-4">
          {state && !state.ok && <Callout tone="danger">{state.error}</Callout>}
          <Input label="Título" name="title" required placeholder="Culto de Domingo" error={fe.title} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Tipo" name="type" defaultValue="culto">
              {Object.entries(EVENT_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
            <Select label="Dia da semana" name="weekday" defaultValue="0">
              {WEEKDAY_NAMES.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </Select>
          </div>
          <Select label="Frequência" name="nthOfMonth" defaultValue="">
            <option value="">Toda semana</option>
            <option value="1">1ª do mês</option>
            <option value="2">2ª do mês</option>
            <option value="3">3ª do mês</option>
            <option value="4">4ª do mês</option>
            <option value="-1">Última do mês</option>
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Início" name="startTime" type="time" defaultValue="19:00" required error={fe.startTime} />
            <Input label="Término" name="endTime" type="time" optional error={fe.endTime} />
          </div>
          <Input label="Local" name="location" optional />
          <Button type="submit" loading={saving} disabled={!recReady}>
            Criar recorrência
          </Button>
        </form>
      </Dialog>

      <Dialog
        open={genFor !== null}
        onClose={() => setGenFor(null)}
        title={`Criar datas: ${genFor?.title ?? ""}`}
        description="Cria rascunhos na agenda. Datas que já existem não são duplicadas."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setGenFor(null)}>
              Cancelar
            </Button>
            <Button loading={pending} onClick={generate}>
              Criar datas
            </Button>
          </>
        }
      >
        <Select label="Período a partir de hoje" value={months} onChange={(e) => setMonths(e.target.value)}>
          <option value="1">1 mês</option>
          <option value="3">3 meses</option>
          <option value="6">6 meses</option>
          <option value="12">1 ano</option>
        </Select>
      </Dialog>
    </div>
  );
}

function SeriesDialog({ rule, onClose }: { rule: Rule; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [startTime, setStartTime] = useState(rule.startTime);
  const [endTime, setEndTime] = useState(rule.endTime ?? "");
  const [location, setLocation] = useState(rule.location ?? "");
  const [active, setActive] = useState(rule.active);
  const save = () =>
    start(async () => {
      const res = await updateSeriesAction(rule.id, { startTime, endTime, location, active });
      toastResult(res);
      if (res.ok) {
        onClose();
        router.refresh();
      }
    });
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Série: ${rule.title}`}
      description="Muda o padrão e as datas futuras que ainda seguem o horário antigo. Datas editadas individualmente são mantidas."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={pending} onClick={save}>
            Salvar série
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Início" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
          <Input label="Término" type="time" optional value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>
        <Input label="Local" optional value={location} onChange={(e) => setLocation(e.target.value)} />
        <Toggle label="Série ativa" description="Pausada, novas datas deixam de ser criadas. As existentes ficam." checked={active} onChange={(e) => setActive(e.target.checked)} />
      </div>
    </Dialog>
  );
}

export function CategoryManager({ categories }: { categories: { id: string; name: string; songs: number }[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ id: string | null; name: string } | null>(null);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      if (!editing) return;
      const res = await saveCategoryAction(editing.id, editing.name);
      if (!res.ok) toast(res.error, "error");
      else {
        toastResult(res);
        setEditing(null);
        router.refresh();
      }
    });
  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y divide-border rounded-[var(--radius-card)] border border-border bg-surface">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center gap-1 py-1 pr-1 pl-4 text-[14px]">
            <span className="flex-1">{c.name}</span> <span className="mr-2 font-mono text-[12.5px] text-muted">{c.songs}</span>
            <button type="button" className="grid h-10 w-10 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg sm:h-8 sm:w-8" aria-label={`Editar categoria ${c.name}`} onClick={() => setEditing({ id: c.id, name: c.name })}>
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <ActionButton
              action={() => deleteCategoryAction(c.id)}
              variant="ghost"
              size="sm"
              className="!h-10 !w-10 !px-0 sm:!h-8 sm:!w-8"
              confirm={{ title: `Remover "${c.name}"?`, description: `${c.songs} ${plural(c.songs, "música", "músicas")} ficarão sem categoria. Nenhuma música é apagada.`, confirmLabel: "Remover", danger: true }}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">Remover categoria {c.name}</span>
            </ActionButton>
          </li>
        ))}
      </ul>
      <Button variant="secondary" size="sm" className="self-start" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setEditing({ id: null, name: "" })}>
        Nova categoria
      </Button>
      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Renomear categoria" : "Nova categoria"}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button loading={pending} onClick={save}>
              Salvar
            </Button>
          </>
        }
      >
        <Input label="Nome" value={editing?.name ?? ""} maxLength={40} onChange={(e) => setEditing((cur) => (cur ? { ...cur, name: e.target.value } : cur))} placeholder="Ex.: Natal" />
      </Dialog>
    </div>
  );
}

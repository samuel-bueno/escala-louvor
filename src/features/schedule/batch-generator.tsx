"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckChip, Input } from "@/components/ui/field";
import { Badge, Callout, Card } from "@/components/ui/primitives";
import { addDays, addMonths, formatDate, formatDayMonth } from "@/domain/dates";
import { cn } from "@/lib/cn";
import { GenerationPreview, type GenerationRequest } from "./generation-preview";
import { plural } from "@/lib/plural";

type Ev = { id: string; title: string; date: string; type: string; slotsTotal: number; slotsFilled: number; minister: string | null; scheduleLocked?: boolean };
type Person = { id: string; name: string; isMinister: boolean };

const PERIODS = [
  { key: "1", label: "Próximo mês", months: 1 },
  { key: "3", label: "3 meses", months: 3 },
  { key: "6", label: "6 meses", months: 6 },
  { key: "12", label: "1 ano", months: 12 },
] as const;

export function BatchGenerator({ events, people, today }: { events: Ev[]; people: Person[]; today: string }) {
  const router = useRouter();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDays(addMonths(today, 1), 0));
  const [scope, setScope] = useState<GenerationRequest["scope"]>("minister");
  const [mode, setMode] = useState<GenerationRequest["mode"]>("fill-empty");
  const [includeRehearsals, setIncludeRehearsals] = useState(false);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [deselected, setDeselected] = useState<string[]>([]);
  const [maxPer, setMaxPer] = useState("");
  const [request, setRequest] = useState<GenerationRequest | null>(null);

  const inRange = useMemo(
    () => events.filter((e) => e.date >= from && e.date <= to && (includeRehearsals || e.type !== "ensaio") && e.slotsTotal > 0),
    [events, from, to, includeRehearsals],
  );
  const selected = inRange.filter((e) => !deselected.includes(e.id));
  const relevantPeople = people.filter((p) => (scope === "minister" ? p.isMinister : true));
  const tooMany = selected.length > 120;

  if (request)
    return (
      <Card className="p-4 sm:p-5">
        <GenerationPreview
          request={request}
          onCancel={() => setRequest(null)}
          onApplied={() => {
            setRequest(null);
            router.refresh();
          }}
        />
      </Card>
    );

  return (
    <div className="flex flex-col gap-0">
      <Step>
        <h2 className="flex items-center gap-2 text-[14px] font-semibold"><span className="grid h-5 w-5 place-items-center rounded-full bg-surface-3 font-mono text-[11px]">1</span>Período</h2>
        <div className="flex flex-wrap gap-2">
          {PERIODS.map((p) => {
            const end = addDays(addMonths(today, p.months), -1);
            const active = from === today && to === end;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  setFrom(today);
                  setTo(end);
                }}
                className={cn("h-9 rounded-md px-3 text-[13px] font-medium sm:h-8", active ? "bg-surface-3 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg")}
                aria-pressed={active}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="De" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label="Até" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </div>
        <CheckChip label="Incluir ensaios" checked={includeRehearsals} onChange={(e) => setIncludeRehearsals(e.target.checked)} />
      </Step>

      <Step>
        <h2 className="flex items-center gap-2 text-[14px] font-semibold"><span className="grid h-5 w-5 place-items-center rounded-full bg-surface-3 font-mono text-[11px]">2</span>O que gerar</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {(
            [
              ["minister", "Ministros", "Distribui os ministros de louvor."],
              ["musicians", "Músicos", "Instrumentos, vozes e técnica."],
              ["all", "Todos", "Ministros e músicos juntos."],
            ] as const
          ).map(([v, l, d]) => (
            <label key={v} className="flex items-start gap-2 rounded-lg border border-border-strong bg-surface p-3 text-[14px] has-[:checked]:border-fg has-[:checked]:bg-primary-soft">
              <input type="radio" name="scope" checked={scope === v} onChange={() => setScope(v)} className="mt-1 accent-[var(--primary)]" />
              <span>
                <span className="block font-medium">{l}</span>
                <span className="block text-[13px] text-muted">{d}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="flex items-start gap-2 rounded-lg border border-border-strong bg-surface p-3 text-[14px] has-[:checked]:border-fg has-[:checked]:bg-primary-soft">
            <input type="radio" name="mode" checked={mode === "fill-empty"} onChange={() => setMode("fill-empty")} className="mt-1 accent-[var(--primary)]" />
            <span>
              <span className="block font-medium">Só vagas em aberto (recomendado)</span>
              <span className="block text-[13px] text-muted">Quem já está escalado é mantido.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 rounded-lg border border-border-strong bg-surface p-3 text-[14px] has-[:checked]:border-fg has-[:checked]:bg-primary-soft">
            <input type="radio" name="mode" checked={mode === "replace-unlocked"} onChange={() => setMode("replace-unlocked")} className="mt-1 accent-[var(--primary)]" />
            <span>
              <span className="block font-medium">Refazer o que não está fixado</span>
              <span className="block text-[13px] text-muted">Fixados nunca mudam; substituições pedem confirmação.</span>
            </span>
          </label>
        </div>
      </Step>

      <Step>
        <h2 className="flex items-center gap-2 text-[14px] font-semibold"><span className="grid h-5 w-5 place-items-center rounded-full bg-surface-3 font-mono text-[11px]">3</span>Pessoas (opcional)</h2>
        <div>
          <p className="mb-2 text-[13px] text-muted">Toque para excluir alguém desta geração. Inativos e indisponíveis já são ignorados automaticamente.</p>
          <div className="flex flex-wrap gap-2">
            {relevantPeople.map((p) => (
              <CheckChip
                key={p.id}
                label={p.name}
                checked={!excluded.includes(p.id)}
                onChange={(e) => setExcluded((cur) => (e.target.checked ? cur.filter((x) => x !== p.id) : [...cur, p.id]))}
              />
            ))}
          </div>
        </div>
        <Input label="Máximo de participações por pessoa no período" type="number" inputMode="numeric" min={1} optional value={maxPer} onChange={(e) => setMaxPer(e.target.value)} hint="Além do limite mensal configurado." />
      </Step>

      <Step>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold"><span className="grid h-5 w-5 place-items-center rounded-full bg-surface-3 font-mono text-[11px]">4</span>Compromissos ({selected.length})</h2>
          <span className="font-mono text-[12.5px] text-muted">
            {formatDate(from)} – {formatDate(to)}
          </span>
        </div>
        {inRange.length === 0 ? (
          <Callout tone="info">Nenhum compromisso com posições neste período. Defina a equipe dos cultos ou crie um evento em Agenda → Novo evento.</Callout>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {inRange.map((e) => (
              <li key={e.id}>
                <CheckChip
                  className="w-full justify-start"
                  checked={!deselected.includes(e.id)}
                  onChange={(ev) => setDeselected((cur) => (ev.target.checked ? cur.filter((x) => x !== e.id) : [...cur, e.id]))}
                  label={
                    <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                      <span className="truncate">
                        {formatDayMonth(e.date)} · {e.title}
                      </span>
                      <Badge tone={e.slotsFilled === e.slotsTotal ? "success" : "warning"}>
                        {e.slotsFilled}/{e.slotsTotal}
                      </Badge>
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
        )}
        {tooMany && <Callout tone="warning">Selecione no máximo 120 compromissos por geração.</Callout>}
      </Step>

      <div className="action-bar mt-4">
        <Button
          size="lg"
          className="w-full"
          icon={<Sparkles className="h-5 w-5" aria-hidden />}
          disabled={selected.length === 0 || tooMany}
          onClick={() => setRequest({ eventIds: selected.map((e) => e.id), scope, mode, excludedIds: excluded, maxPerPerson: maxPer ? Number(maxPer) : null })}
        >
          Ver sugestão para {selected.length} {plural(selected.length, "evento", "eventos")}
        </Button>
      </div>
    </div>
  );
}

function Step({ children }: { children: React.ReactNode }) {
  return <section className="flex flex-col gap-4 border-t border-border py-6 first:border-t-0 first:pt-0">{children}</section>;
}

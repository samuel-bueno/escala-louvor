"use client";

import { ArrowDown, ArrowUp, ExternalLink, GripVertical, Plus, RefreshCw, Save, Shuffle, Sparkles, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select, Toggle } from "@/components/ui/field";
import { Badge, Callout, Card } from "@/components/ui/primitives";
import { toast, toastResult } from "@/components/ui/toast";
import { formatDayMonth } from "@/domain/dates";
import { createRng, randomSeed, shuffle } from "@/domain/random";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/validation";
import { previewSetlistAction, saveSetlistAction } from "@/server/actions/songs";
import { plural } from "@/lib/plural";

export type LibrarySong = {
  id: string;
  title: string;
  artist: string | null;
  categoryId: string | null;
  categoryName: string | null;
  originalKey: string | null;
  durationSec: number | null;
  url: string | null;
  active: boolean;
  lastPlayed: string | null;
};
type Item = { songId: string; key: string | null; notes: string | null; reason?: string; relaxed?: boolean };
type Category = { id: string; name: string };

export function SetlistEditor({
  eventId,
  initial,
  library,
  categories,
  defaults,
  readOnly,
}: {
  eventId: string;
  initial: Item[];
  library: LibrarySong[];
  categories: Category[];
  defaults: { count: number; minInterval: number };
  readOnly: boolean;
}) {
  const router = useRouter();
  const byId = useMemo(() => new Map(library.map((s) => [s.id, s])), [library]);
  const [items, setItems] = useState<Item[]>(initial);
  const [dirty, setDirty] = useState(false);
  const [isPreview, setIsPreview] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [saving, startSave] = useTransition();
  const [generating, startGen] = useTransition();
  const [pickerOpen, setPickerOpen] = useState<{ replaceIndex: number | null } | null>(null);
  const [genOpen, setGenOpen] = useState(false);
  const [query, setQuery] = useState("");
  const dragFrom = useRef<number | null>(null);

  // Configuração do gerador
  const [total, setTotal] = useState(defaults.count);
  const [catCounts, setCatCounts] = useState<Record<string, number>>(() => {
    const pref = ["Abertura", "Celebração", "Adoração", "Encerramento"];
    const init: Record<string, number> = {};
    const plan = [1, 2, 2, 0];
    categories.forEach((c) => {
      const i = pref.indexOf(c.name);
      if (i >= 0 && plan[i]) init[c.id] = plan[i];
    });
    return init;
  });
  const [minInterval, setMinInterval] = useState(defaults.minInterval);
  const [relax, setRelax] = useState(false);
  const [maxDifficulty, setMaxDifficulty] = useState("");
  const [targetMinutes, setTargetMinutes] = useState("");
  const [theme, setTheme] = useState("");
  const [required, setRequired] = useState<string[]>([]);
  const [blocked, setBlocked] = useState<string[]>([]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const change = (next: Item[]) => {
    setItems(next);
    setDirty(true);
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    const next = [...items];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    change(next);
  };

  const generate = () =>
    startGen(async () => {
      const catSum = Object.values(catCounts).reduce((a, b) => a + b, 0);
      const res = await previewSetlistAction({
        eventId,
        total: Math.max(total, catSum),
        categories: Object.entries(catCounts)
          .filter(([, n]) => n > 0)
          .map(([categoryId, count]) => ({ categoryId, count })),
        requiredIds: required,
        blockedIds: blocked,
        minIntervalDays: minInterval,
        maxDifficulty: maxDifficulty ? Number(maxDifficulty) : null,
        targetMinutes: targetMinutes ? Number(targetMinutes) : null,
        themes: theme ? [theme] : [],
        relaxInterval: relax,
        seed: null,
      });
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      const d = res.data!;
      setItems(d.items.map((i) => ({ songId: i.songId, key: null, notes: null, reason: i.reason, relaxed: i.relaxed })));
      setWarnings(d.warnings);
      setIsPreview(true);
      setDirty(true);
      setGenOpen(false);
    });

  const save = () =>
    startSave(async () => {
      const res = await saveSetlistAction({ eventId, items: items.map((i) => ({ songId: i.songId, key: i.key || null, notes: i.notes || null })) });
      toastResult(res);
      if (res.ok) {
        setDirty(false);
        setIsPreview(false);
        setWarnings([]);
        router.refresh();
      }
    });

  const used = new Set(items.map((i) => i.songId));
  const filteredLibrary = library.filter((s) => s.active && (!query || `${s.title} ${s.artist ?? ""} ${s.categoryName ?? ""}`.toLowerCase().includes(query.toLowerCase())));
  const totalSec = items.reduce((a, i) => a + (byId.get(i.songId)?.durationSec ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      {!readOnly && (
        <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">
              {items.length} {plural(items.length, "música", "músicas")}{totalSec ? ` · ~${Math.round(totalSec / 60)} min` : ""}
            </p>
            <p className="text-sm text-muted">{isPreview ? "Prévia gerada — revise e salve." : "Arraste ou use as setas para reordenar."}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="soft" icon={<Sparkles className="h-4 w-4" aria-hidden />} onClick={() => setGenOpen(true)}>
              Gerar repertório
            </Button>
            <Button variant="secondary" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setPickerOpen({ replaceIndex: null })}>
              Adicionar música
            </Button>
          </div>
        </Card>
      )}

      {isPreview && (
        <Callout tone="info" title="Prévia — ainda não salva">
          Reordene, troque, remova ou gere novamente. O repertório só é salvo quando você tocar em &quot;Salvar repertório&quot;.
        </Callout>
      )}
      {warnings.length > 0 && (
        <Callout tone="warning" title="Atenção">
          <ul className="list-disc pl-4">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
          {!relax && warnings.some((w) => w.includes("flexibilizar")) && (
            <Button
              size="sm"
              variant="secondary"
              className="mt-2"
              onClick={() => {
                setRelax(true);
                setGenOpen(true);
              }}
            >
              Flexibilizar intervalo
            </Button>
          )}
        </Callout>
      )}

      {items.length === 0 ? (
        <Card className="p-6 text-center text-muted">Nenhuma música no repertório. Gere automaticamente ou adicione manualmente.</Card>
      ) : (
        <ol className="flex flex-col gap-2" aria-label="Ordem do repertório">
          {items.map((it, i) => {
            const s = byId.get(it.songId);
            if (!s) return null;
            return (
              <li
                key={it.songId}
                draggable={!readOnly}
                onDragStart={() => (dragFrom.current = i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragFrom.current !== null) move(dragFrom.current, i);
                  dragFrom.current = null;
                }}
              >
                <Card className="flex items-start gap-2 p-3">
                  {!readOnly && <GripVertical className="mt-2.5 hidden h-5 w-5 shrink-0 cursor-grab text-muted sm:block" aria-hidden />}
                  <span className="tabular mt-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-accent">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {s.title}
                      {!s.active && (
                        <Badge tone="danger" className="ml-2">
                          inativa
                        </Badge>
                      )}
                    </p>
                    <p className="text-sm text-muted">{[s.artist, s.categoryName, s.durationSec && formatDuration(s.durationSec), s.lastPlayed && `última: ${formatDayMonth(s.lastPlayed)}`].filter(Boolean).join(" · ")}</p>
                    {it.reason && <p className={cn("mt-0.5 text-xs", it.relaxed ? "text-warning" : "text-muted")}>{it.reason}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-1.5 text-sm">
                        <span className="text-muted">Tom</span>
                        <input
                          className={cn("h-9 w-16 rounded-lg border bg-surface px-2 text-center font-mono", !it.key && !s.originalKey ? "border-warning" : "border-border-strong")}
                          aria-label={`Tom de ${s.title} neste culto`}
                          placeholder={s.originalKey ?? "—"}
                          maxLength={8}
                          disabled={readOnly}
                          value={it.key ?? ""}
                          onChange={(e) => change(items.map((x, j) => (j === i ? { ...x, key: e.target.value || null } : x)))}
                        />
                      </label>
                      {!it.key && !s.originalKey && <span className="text-[12px] text-warning">sem tom definido</span>}
                      {it.key && s.originalKey && it.key !== s.originalKey && <span className="font-mono text-[12px] text-muted">orig. {s.originalKey}</span>}
                      <input
                        className="h-9 min-w-40 flex-1 rounded-lg border border-border-strong bg-surface px-2.5 text-[13.5px]"
                        aria-label={`Observação de ${s.title}`}
                        placeholder="Observação (ex.: entra só voz e violão)"
                        maxLength={200}
                        disabled={readOnly}
                        value={it.notes ?? ""}
                        onChange={(e) => change(items.map((x, j) => (j === i ? { ...x, notes: e.target.value || null } : x)))}
                      />
                      {s.url && (
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-accent hover:bg-surface-2">
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Ouvir
                        </a>
                      )}
                    </div>
                  </div>
                  {!readOnly && (
                    <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                      <Button variant="ghost" size="icon" aria-label={`Mover ${s.title} para cima`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`Mover ${s.title} para baixo`} disabled={i === items.length - 1} onClick={() => move(i, i + 1)}>
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`Substituir ${s.title}`} onClick={() => setPickerOpen({ replaceIndex: i })}>
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`Remover ${s.title}`} onClick={() => change(items.filter((_, j) => j !== i))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ol>
      )}

      {!readOnly && (
        <div className="action-bar">
          <span className="flex-1 text-sm font-semibold text-muted" aria-live="polite">
            {dirty ? "Alterações não salvas" : "Tudo salvo"}
          </span>
          {items.length > 1 && (
            <Button variant="ghost" size="icon" aria-label="Embaralhar ordem" title="Embaralhar ordem" onClick={() => change(shuffle(items, createRng(randomSeed())))}>
              <Shuffle className="h-4 w-4" />
            </Button>
          )}
          <Button icon={<Save className="h-4 w-4" aria-hidden />} loading={saving} disabled={!dirty} onClick={save}>
            Salvar repertório
          </Button>
        </div>
      )}

      {/* Seletor de músicas (adicionar / substituir) */}
      <Dialog open={pickerOpen !== null} onClose={() => setPickerOpen(null)} title={pickerOpen?.replaceIndex != null ? "Substituir música" : "Adicionar música"} size="md">
        <Input aria-label="Buscar música" placeholder="Buscar por título, artista ou categoria" value={query} onChange={(e) => setQuery(e.target.value)} data-autofocus />
        <ul className="mt-3 divide-y divide-border">
          {filteredLibrary.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                disabled={used.has(s.id)}
                onClick={() => {
                  const it: Item = { songId: s.id, key: null, notes: null, reason: "Escolhida manualmente." };
                  if (pickerOpen?.replaceIndex != null) change(items.map((x, j) => (j === pickerOpen.replaceIndex ? it : x)));
                  else change([...items, it]);
                  setPickerOpen(null);
                  setQuery("");
                }}
                className="flex min-h-14 w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface-2 disabled:opacity-40"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{s.title}</span>
                  <span className="block text-sm text-muted">{[s.artist, s.categoryName, s.lastPlayed ? `última ${formatDayMonth(s.lastPlayed)}` : "nunca executada"].filter(Boolean).join(" · ")}</span>
                </span>
                {used.has(s.id) ? <Badge>no repertório</Badge> : <Plus className="h-4 w-4 text-accent" aria-hidden />}
              </button>
            </li>
          ))}
          {filteredLibrary.length === 0 && <li className="py-6 text-center text-sm text-muted">Nenhuma música encontrada.</li>}
        </ul>
      </Dialog>

      {/* Configuração do gerador */}
      <Dialog
        open={genOpen}
        onClose={() => setGenOpen(false)}
        title="Gerar repertório automaticamente"
        description="Gera uma prévia. Nada é salvo até você confirmar."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setGenOpen(false)}>
              Cancelar
            </Button>
            <Button loading={generating} icon={<Sparkles className="h-4 w-4" aria-hidden />} onClick={generate}>
              Gerar prévia
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <Input label="Número de músicas" type="number" inputMode="numeric" min={1} max={15} value={total} onChange={(e) => setTotal(Math.max(1, Math.min(15, Number(e.target.value) || 1)))} />
          <fieldset>
            <legend className="mb-1 text-sm font-semibold">Músicas por categoria (na ordem do culto)</legend>
            <p className="mb-2 text-sm text-muted">O restante é completado com qualquer categoria.</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {categories.map((c) => (
                <label key={c.id} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-1.5 text-sm font-semibold">
                  {c.name}
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={10}
                    aria-label={`Quantidade de ${c.name}`}
                    className="h-9 w-14 rounded-lg border border-border-strong bg-surface text-center"
                    value={catCounts[c.id] ?? 0}
                    onChange={(e) => setCatCounts((cur) => ({ ...cur, [c.id]: Math.max(0, Math.min(10, Number(e.target.value) || 0)) }))}
                  />
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input label="Intervalo mínimo (dias)" type="number" inputMode="numeric" min={0} max={365} value={minInterval} onChange={(e) => setMinInterval(Math.max(0, Number(e.target.value) || 0))} hint="Evita repetir músicas recentes." />
            <Select label="Dificuldade máxima" value={maxDifficulty} onChange={(e) => setMaxDifficulty(e.target.value)} optional>
              <option value="">Qualquer</option>
              <option value="1">Fácil</option>
              <option value="2">Média</option>
              <option value="3">Difícil</option>
            </Select>
            <Input label="Duração aproximada (min)" type="number" inputMode="numeric" optional value={targetMinutes} onChange={(e) => setTargetMinutes(e.target.value)} />
          </div>
          <Input label="Tema preferido" optional placeholder="Ex.: gratidão, esperança" value={theme} onChange={(e) => setTheme(e.target.value)} hint="Músicas com este tema ou tag ganham prioridade." />
          <Toggle label="Flexibilizar intervalo se faltar música" description="Usa músicas recentes (marcadas) para completar o total." checked={relax} onChange={(e) => setRelax(e.target.checked)} />
          <SongMultiPick label="Músicas obrigatórias" library={library} value={required} onChange={setRequired} exclude={blocked} />
          <SongMultiPick label="Músicas bloqueadas" library={library} value={blocked} onChange={setBlocked} exclude={required} />
        </div>
      </Dialog>
    </div>
  );
}

function SongMultiPick({ label, library, value, onChange, exclude }: { label: string; library: LibrarySong[]; value: string[]; onChange: (v: string[]) => void; exclude: string[] }) {
  const options = library.filter((s) => s.active && !value.includes(s.id) && !exclude.includes(s.id));
  return (
    <div className="flex flex-col gap-1.5">
      <Select
        label={label}
        optional
        value=""
        onChange={(e) => {
          if (e.target.value) onChange([...value, e.target.value]);
        }}
      >
        <option value="">Escolher música…</option>
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {s.title}
          </option>
        ))}
      </Select>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => (
            <button key={id} type="button" onClick={() => onChange(value.filter((v) => v !== id))} className="inline-flex h-9 items-center gap-1 rounded-full bg-surface-2 px-3 text-sm font-semibold" aria-label={`Remover ${library.find((s) => s.id === id)?.title}`}>
              {library.find((s) => s.id === id)?.title}
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

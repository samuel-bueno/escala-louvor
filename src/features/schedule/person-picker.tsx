"use client";

import { ChevronDown, Search, UserPlus, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { AvailabilityMark } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { plural } from "@/lib/plural";

export interface PickerOption {
  id: string;
  name: string;
  /** Participações no mês (equilíbrio da escala). */
  monthCount: number;
  /** Motivos de alerta (indisponível, conflito, limite…). Vazio = livre. */
  issues: string[];
}

const level = (o: PickerOption): "ok" | "conflict" | "unavailable" => (o.issues.includes("indisponível") ? "unavailable" : o.issues.length ? "conflict" : "ok");

/** "joao" encontra "João": sem acento e sem diferença de maiúsculas. */
export const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

/**
 * Seletor pesquisável de pessoa para uma posição da escala.
 * Mostra ANTES de escolher quem está disponível (✓), em conflito (!) ou indisponível (×).
 * Em tela pequena abre como painel de baixo (Dialog); funciona só com teclado.
 * Convidado: músico de fora, só o nome, sem cadastro.
 */
export function PersonPicker({
  functionName,
  options,
  value,
  guestName,
  currentName,
  disabled,
  allowGuest = true,
  onSelect,
  onGuest,
}: {
  functionName: string;
  options: PickerOption[];
  value: string | null;
  guestName: string | null;
  /** Nome da pessoa atual (mesmo que não esteja nas opções, ex.: sem a função). */
  currentName?: string | null;
  disabled?: boolean;
  allowGuest?: boolean;
  onSelect: (id: string | null) => void;
  onGuest: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const shown = guestName ? `Convidado · ${guestName}` : (options.find((o) => o.id === value)?.name ?? currentName ?? null);
  const triggerName = shown ?? "Vaga em aberto";

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-label={`${functionName}: ${triggerName}. Alterar`}
        onClick={() => setOpen(true)}
        className={cn(
          "flex h-11 w-full min-w-0 items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-left text-[14px] transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-surface sm:h-9",
          !shown && "text-muted",
        )}
      >
        {shown ? <Avatar name={guestName ?? shown} size={20} /> : <span aria-hidden className="h-5 w-5 shrink-0 rounded-full border border-dashed border-border-strong" />}
        <span className="min-w-0 flex-1 truncate">{triggerName}</span>
        {!disabled && <ChevronDown className="h-4 w-4 shrink-0 text-subtle" aria-hidden />}
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title={`Escolher: ${functionName}`} description="Quem está livre aparece primeiro." size="sm">
        {/* O Dialog só renderiza o conteúdo aberto: o painel monta do zero a cada abertura (busca limpa, sem efeitos). */}
        <PickerPanel functionName={functionName} options={options} value={value} guestName={guestName} allowGuest={allowGuest} onSelect={onSelect} onGuest={onGuest} close={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function PickerPanel({
  functionName,
  options,
  value,
  guestName,
  allowGuest,
  onSelect,
  onGuest,
  close,
}: {
  functionName: string;
  options: PickerOption[];
  value: string | null;
  guestName: string | null;
  allowGuest: boolean;
  onSelect: (id: string | null) => void;
  onGuest: (name: string) => void;
  close: () => void;
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [mode, setMode] = useState<"list" | "guest">("list");
  const [guest, setGuest] = useState(guestName ?? "");
  const [confirm, setConfirm] = useState<PickerOption | null>(null);
  const listId = useId();
  const activeRef = useRef<HTMLElement>(null);

  const filtered = useMemo(() => {
    const n = fold(q);
    return options.filter((o) => !n || fold(o.name).includes(n));
  }, [options, q]);
  const free = filtered.filter((o) => level(o) === "ok");
  const warn = filtered.filter((o) => level(o) !== "ok");
  // Linhas navegáveis: [vaga em aberto?] + livres + com aviso
  const rows: ({ kind: "clear" } | { kind: "person"; o: PickerOption })[] = [
    ...(value || guestName ? [{ kind: "clear" as const }] : []),
    ...free.map((o) => ({ kind: "person" as const, o })),
    ...warn.map((o) => ({ kind: "person" as const, o })),
  ];

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const search = (v: string) => {
    setQ(v);
    setActive(0);
  };
  const pick = (o: PickerOption) => {
    if (level(o) === "unavailable") return setConfirm(o); // aviso explícito antes de escalar
    onSelect(o.id);
    close();
  };
  const choose = (i: number) => {
    const r = rows[i];
    if (!r) return;
    if (r.kind === "clear") {
      onSelect(null);
      close();
    } else pick(r.o);
  };

  if (mode === "guest")
    return (
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const n = guest.trim();
          if (!n) return;
          onGuest(n);
          close();
        }}
      >
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">
          Nome do convidado
          <input
            data-autofocus
            value={guest}
            onChange={(e) => setGuest(e.target.value)}
            maxLength={60}
            placeholder="Ex.: Pedro (igreja vizinha)"
            className="h-11 rounded-lg border border-border-strong bg-surface px-3 font-normal sm:h-10"
          />
          <span className="text-[12.5px] font-normal text-muted">Músico de fora, só para preencher a vaga. Não tem cadastro nem acesso ao app e não entra nos limites mensais.</span>
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setMode("list")}>
            Voltar
          </Button>
          <Button type="submit" disabled={!guest.trim()}>
            Usar convidado
          </Button>
        </div>
      </form>
    );

  if (confirm)
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger-soft px-3.5 py-3 text-[13.5px]" role="alert">
          <AvailabilityMark state="unavailable" />
          <p>
            <span className="font-medium">{confirm.name}</span> informou indisponibilidade neste dia. Escalar mesmo assim?
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" data-autofocus onClick={() => setConfirm(null)}>
            Voltar
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              onSelect(confirm.id);
              close();
            }}
          >
            Escalar mesmo assim
          </Button>
        </div>
      </div>
    );

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
        <input
          data-autofocus
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={rows[active] ? `${listId}-${active}` : undefined}
          aria-label={`Buscar pessoa para ${functionName}`}
          value={q}
          onChange={(e) => search(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(rows.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              choose(active);
            }
          }}
          placeholder="Buscar por nome"
          autoComplete="off"
          className="h-11 w-full rounded-lg border border-border-strong bg-surface pr-9 pl-9 sm:h-10"
        />
        {q && (
          <button type="button" aria-label="Limpar busca" onClick={() => search("")} className="absolute top-1/2 right-0 grid h-11 w-11 -translate-y-1/2 place-items-center text-muted hover:text-fg sm:h-10 sm:w-10">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {filtered.length} {plural(filtered.length, "pessoa encontrada", "pessoas encontradas")}
      </p>

      <ul id={listId} role="listbox" aria-label={`Pessoas para ${functionName}`} className="-mx-2 max-h-[min(50dvh,360px)] overflow-y-auto">
        {rows.map((r, i) => {
          const isActive = i === active;
          const base = cn("flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[14px] sm:min-h-9", isActive ? "bg-surface-2" : "hover:bg-surface-2/60");
          if (r.kind === "clear")
            return (
              <li key="clear" id={`${listId}-${i}`} ref={isActive ? (activeRef as React.RefObject<HTMLLIElement>) : undefined} role="option" aria-selected={false} className={cn(base, "text-muted")} onMouseEnter={() => setActive(i)} onClick={() => choose(i)}>
                <span aria-hidden className="grid h-5 w-5 place-items-center rounded-full border border-dashed border-border-strong text-[11px]">
                  –
                </span>
                Deixar a vaga em aberto
              </li>
            );
          const { o } = r;
          const lv = level(o);
          const selected = o.id === value;
          const firstWarn = warn.length > 0 && o === warn[0];
          return (
            <li key={o.id} role="presentation">
              {firstWarn && <p className="mt-2 px-2 pb-1 text-[11.5px] font-medium text-muted">Com aviso</p>}
              <div id={`${listId}-${i}`} ref={isActive ? (activeRef as React.RefObject<HTMLDivElement>) : undefined} role="option" aria-selected={selected} className={base} onMouseEnter={() => setActive(i)} onClick={() => choose(i)}>
                <AvailabilityMark state={lv} label={o.issues.join(", ") || "disponível"} />
                <Avatar name={o.name} size={22} muted={lv === "unavailable"} />
                <span className={cn("min-w-0 flex-1 truncate", lv === "unavailable" && "text-muted")}>
                  {o.name}
                  {selected && <span className="ml-1.5 text-[12px] text-accent">atual</span>}
                </span>
                <span className="max-w-[45%] shrink-0 truncate text-right text-[12px] text-muted" title={o.issues.join(", ")}>
                  {o.issues[0] ?? <span className="font-mono">{o.monthCount}× no mês</span>}
                </span>
              </div>
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li role="presentation" className="px-2 py-6 text-center text-[13.5px] text-muted">
            {options.length === 0 ? `Ninguém ativo tem ${functionName} cadastrado. Cadastre a função no perfil da pessoa ou use um convidado.` : `Ninguém encontrado para “${q}”.`}
          </li>
        )}
      </ul>

      {allowGuest && (
        <button type="button" onClick={() => setMode("guest")} className="mt-1 flex h-11 items-center gap-2 rounded-lg border-t border-border px-2 pt-1 text-[13.5px] font-medium text-accent hover:underline sm:h-10">
          <UserPlus className="h-4 w-4" aria-hidden />
          {guestName ? "Trocar convidado (músico de fora)" : "Convidado (músico de fora)"}
        </button>
      )}
    </div>
  );
}

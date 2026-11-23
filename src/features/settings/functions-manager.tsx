"use client";

import { ArrowDown, ArrowUp, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/field";
import { Badge, Card } from "@/components/ui/primitives";
import { toastResult } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { FUNCTION_KIND_LABELS } from "@/lib/validation";
import { moveFunctionAction, saveFunctionAction, setFunctionActiveAction } from "@/server/actions/settings";
import { plural } from "@/lib/plural";

type Fn = { id: string; name: string; kind: keyof typeof FUNCTION_KIND_LABELS; active: boolean; people: number };

/** Lista extensível de funções/instrumentos — nada fica preso no código. */
export function FunctionsManager({ functions }: { functions: Fn[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Fn | "new" | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Fn["kind"]>("instrument");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const open = (f: Fn | "new") => {
    setEditing(f);
    setName(f === "new" ? "" : f.name);
    setKind(f === "new" ? "instrument" : f.kind);
    setError(null);
  };
  const run = (fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>, close = false) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error);
      toastResult(res);
      if (res.ok) {
        if (close) setEditing(null);
        router.refresh();
      }
    });

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button size="sm" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => open("new")}>
          Nova função
        </Button>
      </div>
      <Card className="divide-y divide-border">
        {functions.map((f, i) => (
          <div key={f.id} className={cn("flex items-center gap-1 py-1.5 pr-2 pl-4", !f.active && "opacity-60")}>
            <span className="tabular w-5 font-mono text-[12px] text-subtle">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-[14px] font-medium">
                {f.name} {!f.active && <Badge>Inativa</Badge>}
              </p>
              <p className="text-[12.5px] text-muted">
                {FUNCTION_KIND_LABELS[f.kind]} · <span className="font-mono">{f.people}</span> {plural(f.people, "pessoa", "pessoas")}
              </p>
            </div>
            <Button variant="ghost" size="icon" aria-label={`Subir ${f.name}`} disabled={i === 0 || pending} onClick={() => run(() => moveFunctionAction(f.id, -1))}>
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label={`Descer ${f.name}`} disabled={i === functions.length - 1 || pending} onClick={() => run(() => moveFunctionAction(f.id, 1))}>
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label={`Editar ${f.name}`} onClick={() => open(f)}>
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </Card>

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Nova função" : "Editar função"}
        size="sm"
        footer={
          <>
            {editing && editing !== "new" && (
              <Button variant="ghost" className="sm:mr-auto" onClick={() => run(() => setFunctionActiveAction(editing.id, !editing.active), true)}>
                {editing.active ? "Desativar" : "Reativar"}
              </Button>
            )}
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button loading={pending} onClick={() => run(() => saveFunctionAction(editing === "new" ? null : editing!.id, { name, kind }), true)}>
              Salvar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Saxofone" error={error ?? undefined} maxLength={40} />
          <Select label="Tipo" value={kind} onChange={(e) => setKind(e.target.value as Fn["kind"])} hint="Ministração identifica quem pode ser ministro na geração automática.">
            {Object.entries(FUNCTION_KIND_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </div>
      </Dialog>
    </>
  );
}

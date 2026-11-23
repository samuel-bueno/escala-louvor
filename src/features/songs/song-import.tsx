"use client";

import { AlertTriangle, CheckCircle2, Copy, FileUp, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/field";
import { Badge, Callout, Card } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { isValidHttpUrl, parseSongImport, type ImportRow } from "@/domain/song-import";
import { cn } from "@/lib/cn";
import { importSongsAction } from "@/server/actions/songs";
import { plural } from "@/lib/plural";

type Row = ImportRow & { key: number; removed: boolean };

/**
 * Importação em lote: colar → validar → prévia editável → importar.
 * Não busca nada na internet (sem scraping): só valida o formato dos links.
 */
export function SongImport({ existingTitles, existingUrls, categories }: { existingTitles: string[]; existingUrls: string[]; categories: { id: string; name: string }[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [pending, start] = useTransition();

  const analyze = () => {
    const parsed = parseSongImport(text, existingTitles, existingUrls);
    if (!parsed.length) {
      toast("Cole ao menos uma linha.", "error");
      return;
    }
    setRows(parsed.map((r, i) => ({ ...r, key: i, removed: r.duplicateOf !== null })));
  };

  const edit = (key: number, patch: Partial<Row>) =>
    setRows((rs) =>
      rs!.map((r) => {
        if (r.key !== key) return r;
        const n = { ...r, ...patch };
        const errors: string[] = [];
        if (!n.title.trim()) errors.push("Informe o nome da música.");
        if (n.url && !isValidHttpUrl(n.url)) errors.push("Link inválido. Use um endereço começando com https://");
        return { ...n, errors };
      }),
    );

  const active = useMemo(() => (rows ?? []).filter((r) => !r.removed), [rows]);
  const invalid = active.filter((r) => r.errors.length > 0);

  const submit = () =>
    start(async () => {
      const res = await importSongsAction({ categoryId: categoryId || null, rows: active.map((r) => ({ title: r.title.trim(), artist: r.artist?.trim() || null, url: r.url?.trim() || null })) });
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      toast(res.message ?? "Importação concluída.");
      router.push("/musicas");
      router.refresh();
    });

  if (!rows)
    return (
      <Card className="flex flex-col gap-4 p-4 sm:p-5">
        <Textarea
          label="Cole sua lista"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="min-h-56 font-mono text-[15px]"
          placeholder={"Caminho de Luz | https://exemplo.com/caminho-de-luz\nRei Eterno | Banda Alvorada | https://exemplo.com/rei-eterno\nhttps://exemplo.com/outra-musica\nGraça Sobre Graça"}
          hint="Um item por linha: Nome | URL, ou Nome | Artista | URL, ou só o nome. Também aceita CSV com ; (Nome;URL)."
        />
        <div className="flex justify-end">
          <Button icon={<FileUp className="h-4 w-4" aria-hidden />} onClick={analyze} disabled={!text.trim()}>
            Revisar antes de importar
          </Button>
        </div>
      </Card>
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Badge tone="success" icon={<CheckCircle2 className="h-3 w-3" aria-hidden />}>
          {active.length - invalid.length} {plural(active.length - invalid.length, "pronta", "prontas")}
        </Badge>
        {invalid.length > 0 && <Badge tone="danger" icon={<AlertTriangle className="h-3 w-3" aria-hidden />}>{invalid.length} com erro</Badge>}
        {rows.filter((r) => r.duplicateOf).length > 0 && <Badge tone="warning" icon={<Copy className="h-3 w-3" aria-hidden />}>{rows.filter((r) => r.duplicateOf).length} {plural(rows.filter((r) => r.duplicateOf).length, "duplicada", "duplicadas")} — removidas</Badge>}
      </div>
      <Card className="p-4">
        <Select label="Categoria para todas" optional value={categoryId} onChange={(e) => setCategoryId(e.target.value)} hint="Você pode ajustar cada música depois.">
          <option value="">Sem categoria</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Card>
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.key}>
            <Card className={cn("p-3", r.removed && "opacity-50", !r.removed && r.errors.length > 0 && "border-danger/50")}>
              <div className="flex items-start gap-2">
                <span className="tabular mt-3 w-6 shrink-0 text-xs text-muted">{r.line}</span>
                <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-[1.2fr_0.8fr_1.4fr]">
                  <input aria-label={`Título da linha ${r.line}`} className="h-11 rounded-lg border border-border-strong bg-surface px-3" value={r.title} disabled={r.removed} onChange={(e) => edit(r.key, { title: e.target.value })} placeholder="Título" />
                  <input aria-label={`Artista da linha ${r.line}`} className="h-11 rounded-lg border border-border-strong bg-surface px-3" value={r.artist ?? ""} disabled={r.removed} onChange={(e) => edit(r.key, { artist: e.target.value || null })} placeholder="Artista (opcional)" />
                  <input aria-label={`Link da linha ${r.line}`} className="h-11 rounded-lg border border-border-strong bg-surface px-3" value={r.url ?? ""} disabled={r.removed} onChange={(e) => edit(r.key, { url: e.target.value || null })} placeholder="https:// (opcional)" inputMode="url" />
                </div>
                <Button variant="ghost" size="icon" aria-label={r.removed ? `Incluir linha ${r.line}` : `Remover linha ${r.line}`} onClick={() => edit(r.key, { removed: !r.removed })}>
                  {r.removed ? <span className="text-xs font-semibold">+</span> : <Trash2 className="h-4 w-4" />}
                </Button>
              </div>
              {r.duplicateOf && <p className="mt-1.5 ml-8 text-xs font-semibold text-warning">{r.duplicateOf === "existing" ? "Já existe na biblioteca." : "Repetida nesta lista."}</p>}
              {!r.removed && r.errors.map((e) => (
                <p key={e} className="mt-1.5 ml-8 text-xs font-semibold text-danger">
                  {e}
                </p>
              ))}
            </Card>
          </li>
        ))}
      </ul>
      {invalid.length > 0 && <Callout tone="danger">Corrija ou remova as linhas com erro para importar.</Callout>}
      <div className="action-bar">
        <Button variant="ghost" onClick={() => setRows(null)}>
          Voltar
        </Button>
        <Button className="ml-auto" loading={pending} disabled={active.length === 0 || invalid.length > 0} onClick={submit}>
          Importar {active.length} {plural(active.length, "música", "músicas")}
        </Button>
      </div>
    </div>
  );
}

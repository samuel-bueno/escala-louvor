"use client";

import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select, Textarea, Toggle } from "@/components/ui/field";
import { Callout, Card } from "@/components/ui/primitives";
import { useFormAction } from "@/lib/use-form-action";
import { formatDuration } from "@/lib/validation";
import type { ActionResult } from "@/server/action-utils";
import { saveSongAction } from "@/server/actions/songs";

export type SongFormValues = {
  id?: string;
  title: string;
  artist: string | null;
  originalKey: string | null;
  bpm: number | null;
  durationSec: number | null;
  url: string | null;
  categoryId: string | null;
  theme: string | null;
  tags: string[];
  difficulty: number | null;
  active: boolean;
  notes: string | null;
  extraLinks: string;
};

export function SongForm({ initial, categories }: { initial: SongFormValues; categories: { id: string; name: string }[] }) {
  const { state, formProps, pending, ready, fieldErrors: fe } = useFormAction<ActionResult>(saveSongAction.bind(null, initial.id ?? null));
  return (
    <form {...formProps} className="flex flex-col gap-5">
      {state && !state.ok && (
        <Callout tone="danger" role="alert">
          {state.error}
        </Callout>
      )}
      <Card className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-5">
        <Input label="Título" name="title" required defaultValue={initial.title} error={fe.title} wrapperClassName="sm:col-span-2" />
        <Input label="Artista / ministério" name="artist" optional defaultValue={initial.artist ?? ""} error={fe.artist} />
        <Select label="Categoria" name="categoryId" optional defaultValue={initial.categoryId ?? ""}>
          <option value="">Sem categoria</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Input label="Link principal" name="url" type="url" inputMode="url" optional placeholder="https://" defaultValue={initial.url ?? ""} error={fe.url} wrapperClassName="sm:col-span-2" hint="YouTube, Spotify, Drive… O app apenas guarda o link." />
        <div className="grid grid-cols-2 gap-3 sm:col-span-2 sm:grid-cols-3">
          <Input label="Tom" name="originalKey" optional maxLength={8} placeholder="G" defaultValue={initial.originalKey ?? ""} error={fe.originalKey} />
          <Input label="BPM" name="bpm" type="number" inputMode="numeric" optional defaultValue={initial.bpm ?? ""} error={fe.bpm} />
          <Input label="Duração" name="duration" optional placeholder="4:30" inputMode="numeric" defaultValue={formatDuration(initial.durationSec)} error={fe.duration} />
        </div>
        <Input label="Tema" name="theme" optional defaultValue={initial.theme ?? ""} error={fe.theme} placeholder="Ex.: gratidão" />
        <Select label="Dificuldade" name="difficulty" optional defaultValue={initial.difficulty ?? ""}>
          <option value="">Não informar</option>
          <option value="1">Fácil</option>
          <option value="2">Média</option>
          <option value="3">Difícil</option>
        </Select>
        <Input label="Tags" name="tags" optional defaultValue={initial.tags.join(", ")} hint="Separe por vírgula." wrapperClassName="sm:col-span-2" />
        <Textarea
          label="Links adicionais"
          name="extraLinks"
          optional
          defaultValue={initial.extraLinks}
          error={fe.extraLinks}
          wrapperClassName="sm:col-span-2"
          placeholder={"Cifra | https://…\nPlayback | https://…"}
          hint="Um por linha, no formato Rótulo | URL."
        />
        <Textarea label="Observações" name="notes" optional defaultValue={initial.notes ?? ""} error={fe.notes} wrapperClassName="sm:col-span-2" />
        {initial.id && <Toggle label="Música ativa" description="Inativas ficam no histórico, mas não entram na geração automática." name="active" defaultChecked={initial.active} className="sm:col-span-2" />}
      </Card>
      <div className="action-bar">
        <ButtonLink href={initial.id ? `/musicas/${initial.id}` : "/musicas"} variant="ghost" className="flex-1 sm:flex-none">
          Cancelar
        </ButtonLink>
        <Button type="submit" loading={pending} disabled={!ready} className="flex-1 sm:ml-auto sm:flex-none">
          {initial.id ? "Salvar alterações" : "Cadastrar música"}
        </Button>
      </div>
    </form>
  );
}

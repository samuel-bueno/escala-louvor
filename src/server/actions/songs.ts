"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { formatDate } from "@/domain/dates";
import { createRng, randomSeed } from "@/domain/random";
import { generateSetlist, type SetlistResult } from "@/domain/setlist/generate";
import { isValidHttpUrl, normalizeTitle } from "@/domain/song-import";
import { songSchema } from "@/lib/validation";
import { audit, flash, runAction, UserError, type ActionResult } from "../action-utils";
import { assertAdmin, assertCanEditSetlist } from "../auth/session";
import { db } from "../db/client";
import { events, setlistItems, songCategories, songPlays, songResources, songs } from "../db/schema";
import { loadSetlistSongs } from "../queries/songs";
import { plural } from "@/lib/plural";

function readSongForm(fd: FormData) {
  const keys = ["title", "artist", "originalKey", "bpm", "duration", "url", "categoryId", "theme", "tags", "difficulty", "active", "notes", "extraLinks"];
  return Object.fromEntries(keys.map((k) => [k, (fd.get(k) as string | null) ?? ""]));
}

async function assertCategory(orgId: string, categoryId: string | null) {
  if (!categoryId) return;
  const c = await db.select({ id: songCategories.id }).from(songCategories).where(and(eq(songCategories.id, categoryId), eq(songCategories.organizationId, orgId))).get();
  if (!c) throw new UserError("Categoria inexistente.");
}

export async function saveSongAction(id: string | null, _prev: unknown, fd: FormData): Promise<ActionResult> {
  let savedId = id;
  const res = await runAction("saveSong", async () => {
    const user = await assertCanEditSetlist();
    const input = songSchema.parse(readSongForm(fd));
    await assertCategory(user.organizationId, input.categoryId);
    // Duplicidade por título normalizado
    const all = await db.select({ id: songs.id, title: songs.title }).from(songs).where(eq(songs.organizationId, user.organizationId));
    const dup = all.find((s) => s.id !== id && normalizeTitle(s.title) === normalizeTitle(input.title));
    if (dup) return { ok: false, error: "Já existe uma música com este título.", fieldErrors: { title: `Duplicada de "${dup.title}".` } };

    const values = {
      title: input.title,
      artist: input.artist,
      originalKey: input.originalKey,
      bpm: input.bpm,
      durationSec: input.duration,
      url: input.url,
      categoryId: input.categoryId,
      theme: input.theme,
      tags: input.tags,
      difficulty: input.difficulty,
      active: id ? input.active : true,
      notes: input.notes,
    };
    await db.transaction(async (tx) => {
      if (id) {
        const found = await tx.select({ id: songs.id }).from(songs).where(and(eq(songs.id, id), eq(songs.organizationId, user.organizationId))).get();
        if (!found) throw new UserError("Música não encontrada.");
        await tx.update(songs).set(values).where(eq(songs.id, id));
        await tx.delete(songResources).where(eq(songResources.songId, id));
      } else {
        const [row] = await tx.insert(songs).values({ ...values, organizationId: user.organizationId }).returning({ id: songs.id });
        savedId = row.id;
      }
      const links = input.extraLinks.map((line) => {
        const parts = line.split("|").map((p) => p.trim());
        const url = parts.pop()!;
        return { songId: savedId!, url, label: parts.join(" ") || null, kind: "link" as const };
      });
      if (links.length) await tx.insert(songResources).values(links);
    });
    await audit(user, id ? "song.update" : "song.create", "song", savedId, `${id ? "Editou" : "Cadastrou"} a música "${values.title}"`);
    return { ok: true };
  });
  if (!res.ok) return res;
  revalidatePath("/musicas");
  await flash(id ? "Música atualizada." : "Música cadastrada.");
  redirect(`/musicas/${savedId}`);
}

export async function setSongActiveAction(id: string, active: boolean): Promise<ActionResult> {
  return runAction("setSongActive", async () => {
    const user = await assertCanEditSetlist();
    const s = await db.select().from(songs).where(and(eq(songs.id, id), eq(songs.organizationId, user.organizationId))).get();
    if (!s) throw new UserError("Música não encontrada.");
    await db.update(songs).set({ active }).where(eq(songs.id, id));
    await audit(user, active ? "song.activate" : "song.deactivate", "song", id, `${active ? "Reativou" : "Desativou"} "${s.title}"`);
    revalidatePath("/musicas");
    revalidatePath(`/musicas/${id}`);
    return { ok: true, message: active ? "Música reativada." : "Música desativada. Ela continua no histórico, mas não entra em gerações." };
  });
}

export async function deleteSongAction(id: string): Promise<ActionResult> {
  const res = await runAction("deleteSong", async () => {
    const user = await assertAdmin();
    const s = await db.select().from(songs).where(and(eq(songs.id, id), eq(songs.organizationId, user.organizationId))).get();
    if (!s) throw new UserError("Música não encontrada.");
    const used = await db.select({ id: setlistItems.id }).from(setlistItems).where(eq(setlistItems.songId, id)).limit(1).get();
    const played = await db.select({ id: songPlays.id }).from(songPlays).where(eq(songPlays.songId, id)).limit(1).get();
    if (used || played) throw new UserError("Esta música já foi usada em repertórios. Desative em vez de excluir para manter o histórico.");
    await db.delete(songs).where(eq(songs.id, id));
    await audit(user, "song.delete", "song", id, `Excluiu a música "${s.title}"`);
    return { ok: true };
  });
  if (!res.ok) return res;
  revalidatePath("/musicas");
  await flash("Música excluída.");
  redirect("/musicas");
}

// ---------------------------------------------------------------------------
// Importação em lote
// ---------------------------------------------------------------------------
const importInput = z.object({
  categoryId: z.string().nullable(),
  rows: z
    .array(z.object({ title: z.string().trim().min(1, "Título vazio.").max(160), artist: z.string().trim().max(120).nullable(), url: z.string().trim().nullable() }))
    .min(1, "Nenhuma linha válida para importar.")
    .max(500, "Importe no máximo 500 músicas por vez."),
});

export async function importSongsAction(raw: z.input<typeof importInput>): Promise<ActionResult<{ created: number; skipped: number }>> {
  return runAction("importSongs", async () => {
    const user = await assertCanEditSetlist();
    const input = importInput.parse(raw);
    await assertCategory(user.organizationId, input.categoryId);
    for (const r of input.rows) if (r.url && !isValidHttpUrl(r.url)) throw new UserError(`Link inválido em "${r.title}".`);
    const existing = await db.select({ title: songs.title }).from(songs).where(eq(songs.organizationId, user.organizationId));
    const seen = new Set(existing.map((s) => normalizeTitle(s.title)));
    const toInsert = [];
    for (const r of input.rows) {
      const n = normalizeTitle(r.title);
      if (seen.has(n)) continue; // duplicidade: nunca cria cópia
      seen.add(n);
      toInsert.push({ organizationId: user.organizationId, title: r.title, artist: r.artist || null, url: r.url || null, categoryId: input.categoryId });
    }
    if (toInsert.length) await db.insert(songs).values(toInsert);
    await audit(user, "song.import", "song", null, `Importou ${toInsert.length} ${plural(toInsert.length, "música", "músicas")}`);
    revalidatePath("/musicas");
    const skipped = input.rows.length - toInsert.length;
    return { ok: true, data: { created: toInsert.length, skipped }, message: `${toInsert.length} ${plural(toInsert.length, "música", "músicas")} importada(s)${skipped ? `, ${skipped} ${plural(skipped, "duplicada", "duplicadas")} ignorada(s)` : ""}.` };
  });
}

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------
export async function saveCategoryAction(id: string | null, name: string): Promise<ActionResult> {
  return runAction("saveCategory", async () => {
    const user = await assertAdmin();
    const clean = z.string().trim().min(2, "Nome muito curto.").max(40, "Nome muito longo.").parse(name);
    const dup = await db.select({ id: songCategories.id }).from(songCategories).where(and(eq(songCategories.organizationId, user.organizationId), sql`lower(${songCategories.name}) = lower(${clean})`)).get();
    if (dup && dup.id !== id) throw new UserError("Já existe uma categoria com este nome.");
    if (id) await db.update(songCategories).set({ name: clean }).where(and(eq(songCategories.id, id), eq(songCategories.organizationId, user.organizationId)));
    else {
      const count = await db.select({ n: sql<number>`count(*)` }).from(songCategories).where(eq(songCategories.organizationId, user.organizationId)).get();
      await db.insert(songCategories).values({ organizationId: user.organizationId, name: clean, sortOrder: Number(count?.n ?? 0) });
    }
    revalidatePath("/configuracoes");
    revalidatePath("/musicas");
    return { ok: true, message: id ? "Categoria renomeada." : "Categoria criada." };
  });
}

export async function deleteCategoryAction(id: string): Promise<ActionResult> {
  return runAction("deleteCategory", async () => {
    const user = await assertAdmin();
    // Músicas da categoria ficam "sem categoria" (FK on delete set null).
    await db.delete(songCategories).where(and(eq(songCategories.id, id), eq(songCategories.organizationId, user.organizationId)));
    revalidatePath("/configuracoes");
    revalidatePath("/musicas");
    return { ok: true, message: "Categoria removida. As músicas dela ficaram sem categoria." };
  });
}

// ---------------------------------------------------------------------------
// Repertório
// ---------------------------------------------------------------------------
const setlistPreviewInput = z.object({
  eventId: z.string(),
  total: z.number().int().min(1, "Mínimo 1 música.").max(15, "Máximo 15 músicas."),
  categories: z.array(z.object({ categoryId: z.string(), count: z.number().int().min(0).max(15) })).default([]),
  requiredIds: z.array(z.string()).default([]),
  blockedIds: z.array(z.string()).default([]),
  minIntervalDays: z.number().int().min(0).max(365),
  maxDifficulty: z.number().int().min(1).max(3).nullable().default(null),
  targetMinutes: z.number().int().min(1).max(240).nullable().default(null),
  themes: z.array(z.string().trim().max(40)).default([]),
  relaxInterval: z.boolean().default(false),
  seed: z.number().int().nullable().default(null),
});

export async function previewSetlistAction(raw: z.input<typeof setlistPreviewInput>): Promise<ActionResult<SetlistResult & { seed: number }>> {
  return runAction("previewSetlist", async () => {
    const user = await assertCanEditSetlist();
    const input = setlistPreviewInput.parse(raw);
    const ev = await db.select().from(events).where(and(eq(events.id, input.eventId), eq(events.organizationId, user.organizationId))).get();
    if (!ev) throw new UserError("Compromisso não encontrado.");
    const catSum = input.categories.reduce((s, c) => s + c.count, 0);
    if (catSum > input.total) throw new UserError(`As categorias somam ${catSum} músicas, mais que o total de ${input.total}.`);
    const [list, cats] = await Promise.all([
      loadSetlistSongs(user.organizationId, ev.id),
      db.select().from(songCategories).where(eq(songCategories.organizationId, user.organizationId)),
    ]);
    const seed = input.seed ?? randomSeed();
    const result = generateSetlist(list, {
      ...input,
      date: ev.date,
      categories: input.categories.filter((c) => c.count > 0),
      rng: createRng(seed),
      categoryNames: Object.fromEntries(cats.map((c) => [c.id, c.name])),
    });
    return { ok: true, data: { ...result, seed } };
  });
}

const saveSetlistInput = z.object({
  eventId: z.string(),
  items: z
    .array(z.object({ songId: z.string(), key: z.string().trim().max(8).nullable().default(null), notes: z.string().trim().max(200).nullable().default(null) }))
    .max(30, "Máximo de 30 músicas."),
});

export async function saveSetlistAction(raw: z.input<typeof saveSetlistInput>): Promise<ActionResult> {
  return runAction("saveSetlist", async () => {
    const user = await assertCanEditSetlist();
    const input = saveSetlistInput.parse(raw);
    const ev = await db.select().from(events).where(and(eq(events.id, input.eventId), eq(events.organizationId, user.organizationId))).get();
    if (!ev) throw new UserError("Compromisso não encontrado.");
    if (ev.status === "cancelled") throw new UserError("Compromisso cancelado não pode ter o repertório alterado.");
    const ids = input.items.map((i) => i.songId);
    if (new Set(ids).size !== ids.length) throw new UserError("A mesma música aparece duas vezes no repertório.");
    if (ids.length) {
      const found = await db.select({ id: songs.id }).from(songs).where(and(eq(songs.organizationId, user.organizationId), inArray(songs.id, ids)));
      if (found.length !== ids.length) throw new UserError("Alguma música não existe mais. Recarregue a página.");
    }
    await db.transaction(async (tx) => {
      await tx.update(events).set({ setlistUpdatedAt: new Date(), setlistUpdatedBy: user.participantName ?? user.name }).where(eq(events.id, ev.id));
      await tx.delete(setlistItems).where(eq(setlistItems.eventId, ev.id));
      if (input.items.length) await tx.insert(setlistItems).values(input.items.map((it, i) => ({ eventId: ev.id, songId: it.songId, position: i, key: it.key || null, notes: it.notes || null })));
      if (ev.status === "completed") {
        // Mantém o histórico coerente se o repertório de um culto concluído for corrigido.
        await tx.delete(songPlays).where(eq(songPlays.eventId, ev.id));
        if (input.items.length)
          await tx.insert(songPlays).values(input.items.map((it) => ({ organizationId: user.organizationId, songId: it.songId, eventId: ev.id, date: ev.date, key: it.key || null })));
      }
    });
    await audit(user, "setlist.save", "event", ev.id, `Atualizou o repertório de "${ev.title}" (${formatDate(ev.date)}) — ${input.items.length} ${plural(input.items.length, "música", "músicas")}`);
    revalidatePath(`/eventos/${ev.id}`, "layout");
    revalidatePath("/");
    return { ok: true, message: "Repertório atualizado." };
  });
}

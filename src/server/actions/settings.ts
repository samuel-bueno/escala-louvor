"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { functionSchema, recurrenceSchema, settingsSchema } from "@/lib/validation";
import { audit, runAction, UserError, type ActionResult } from "../action-utils";
import { assertAdmin } from "../auth/session";
import { appBaseUrl } from "../auth/base-url";
import { generateToken, hashToken } from "../auth/tokens";
import { db } from "../db/client";
import { events, functions, orgSettings, recurrenceRules, shareLinks } from "../db/schema";

export async function saveSettingsAction(_prev: unknown, fd: FormData): Promise<ActionResult> {
  return runAction("saveSettings", async () => {
    const user = await assertAdmin();
    const input = settingsSchema.parse(Object.fromEntries(["avoidConsecutive", "defaultMonthlyLimit", "limitMode", "minIntervalDays", "prioritizeLess", "songMinIntervalDays", "defaultSongCount"].map((k) => [k, fd.get(k) ?? ""])));
    const fnIds = fd.getAll("positionFunctionId").map(String);
    const counts = fd.getAll("positionCount").map((c) => Number(c));
    const valid = new Set((await db.select({ id: functions.id }).from(functions).where(eq(functions.organizationId, user.organizationId))).map((f) => f.id));
    const defaultPositions = fnIds.map((functionId, i) => ({ functionId, count: Math.max(0, Math.min(10, Math.floor(counts[i] || 0))) })).filter((p) => valid.has(p.functionId) && p.count > 0);
    await db
      .insert(orgSettings)
      .values({ organizationId: user.organizationId, ...input, defaultPositions })
      .onConflictDoUpdate({ target: orgSettings.organizationId, set: { ...input, defaultPositions } });
    await audit(user, "settings.update", "settings", null, "Atualizou as regras de distribuição");
    revalidatePath("/configuracoes");
    return { ok: true, message: "Configurações salvas." };
  });
}

export async function saveFunctionAction(id: string | null, raw: { name: string; kind: string }): Promise<ActionResult> {
  return runAction("saveFunction", async () => {
    const user = await assertAdmin();
    const input = functionSchema.parse(raw);
    const dup = await db.select({ id: functions.id }).from(functions).where(and(eq(functions.organizationId, user.organizationId), sql`lower(${functions.name}) = lower(${input.name})`)).get();
    if (dup && dup.id !== id) throw new UserError("Já existe uma função com este nome.");
    if (id) await db.update(functions).set(input).where(and(eq(functions.id, id), eq(functions.organizationId, user.organizationId)));
    else {
      const count = await db.select({ n: sql<number>`count(*)` }).from(functions).where(eq(functions.organizationId, user.organizationId)).get();
      await db.insert(functions).values({ ...input, organizationId: user.organizationId, sortOrder: Number(count?.n ?? 0) });
    }
    await audit(user, id ? "function.update" : "function.create", "function", id, `${id ? "Editou" : "Criou"} a função "${input.name}"`);
    revalidatePath("/funcoes");
    return { ok: true, message: id ? "Função atualizada." : "Função criada." };
  });
}

/** Funções não são apagadas (histórico); são desativadas. */
export async function setFunctionActiveAction(id: string, active: boolean): Promise<ActionResult> {
  return runAction("setFunctionActive", async () => {
    const user = await assertAdmin();
    await db.update(functions).set({ active }).where(and(eq(functions.id, id), eq(functions.organizationId, user.organizationId)));
    revalidatePath("/funcoes");
    return { ok: true, message: active ? "Função reativada." : "Função desativada. Ela continua no histórico." };
  });
}

export async function moveFunctionAction(id: string, direction: -1 | 1): Promise<ActionResult> {
  return runAction("moveFunction", async () => {
    const user = await assertAdmin();
    const list = await db.select().from(functions).where(eq(functions.organizationId, user.organizationId)).orderBy(functions.sortOrder, functions.name);
    const i = list.findIndex((f) => f.id === id);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= list.length) return { ok: true };
    [list[i], list[j]] = [list[j], list[i]];
    await db.transaction(async (tx) => {
      for (const [idx, f] of list.entries()) await tx.update(functions).set({ sortOrder: idx }).where(eq(functions.id, f.id));
    });
    revalidatePath("/funcoes");
    return { ok: true };
  });
}

export async function saveRecurrenceAction(_prev: unknown, fd: FormData): Promise<ActionResult> {
  return runAction("saveRecurrence", async () => {
    const user = await assertAdmin();
    const input = recurrenceSchema.parse(Object.fromEntries(["title", "type", "weekday", "nthOfMonth", "startTime", "endTime", "location"].map((k) => [k, fd.get(k) ?? ""])));
    await db.insert(recurrenceRules).values({ ...input, organizationId: user.organizationId });
    await audit(user, "recurrence.create", "recurrence", null, `Criou a recorrência "${input.title}"`);
    revalidatePath("/configuracoes");
    return { ok: true, message: "Recorrência criada." };
  });
}

export async function deleteRecurrenceAction(id: string): Promise<ActionResult> {
  return runAction("deleteRecurrence", async () => {
    const user = await assertAdmin();
    // Eventos já criados permanecem (recurrence_id vira null).
    await db.delete(recurrenceRules).where(and(eq(recurrenceRules.id, id), eq(recurrenceRules.organizationId, user.organizationId)));
    revalidatePath("/configuracoes");
    return { ok: true, message: "Recorrência removida. Os compromissos já criados foram mantidos." };
  });
}

// ---------------------------------------------------------------------------
// Link público da escala
// ---------------------------------------------------------------------------
export async function createShareLinkAction(eventId: string, days: number): Promise<ActionResult<{ url: string }>> {
  return runAction("createShareLink", async () => {
    const user = await assertAdmin();
    const validDays = z.number().int().min(1).max(90).parse(days);
    const ev = await db.select().from(events).where(and(eq(events.id, eventId), eq(events.organizationId, user.organizationId))).get();
    if (!ev) throw new UserError("Compromisso não encontrado.");
    if (ev.status === "draft") throw new UserError("Publique a escala antes de compartilhar.");
    const token = generateToken();
    await db.insert(shareLinks).values({ organizationId: user.organizationId, eventId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + validDays * 86_400_000), createdBy: user.id });
    await audit(user, "share.create", "event", eventId, `Criou link público de "${ev.title}" (${validDays} dias)`);
    const base = await appBaseUrl();
    revalidatePath(`/eventos/${eventId}`);
    return { ok: true, data: { url: `${base}/s/${token}` }, message: "Link criado. Copie agora — por segurança ele não é exibido novamente." };
  });
}

export async function revokeShareLinkAction(id: string): Promise<ActionResult> {
  return runAction("revokeShareLink", async () => {
    const user = await assertAdmin();
    const link = await db.select().from(shareLinks).where(and(eq(shareLinks.id, id), eq(shareLinks.organizationId, user.organizationId))).get();
    if (!link) throw new UserError("Link não encontrado.");
    await db.update(shareLinks).set({ revokedAt: new Date() }).where(eq(shareLinks.id, id));
    await audit(user, "share.revoke", "event", link.eventId, "Revogou um link público");
    revalidatePath(`/eventos/${link.eventId}`);
    return { ok: true, message: "Link revogado. Quem tiver o endereço não consegue mais abrir." };
  });
}

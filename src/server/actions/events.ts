"use server";

import { and, asc, desc, eq, inArray, lt, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { addDays, formatDate, isValidDate, todayIn, weekday } from "@/domain/dates";
import { dedupeAlerts } from "@/domain/scheduling/alerts";
import { eventSchema, EVENT_STATUS_LABELS } from "@/lib/validation";
import { audit, flash, runAction, UserError, type ActionResult } from "../action-utils";
import { assertAdmin, assertCanPublish, type CurrentUser } from "../auth/session";
import { db } from "../db/client";
import { eventSlots, events, functions, recurrenceRules, setlistItems, songPlays, type EventStatus } from "../db/schema";
import { materializeRule } from "../recurrence";
import { computeEventAlerts } from "./schedule-helpers";
import { plural } from "@/lib/plural";

function readEventForm(fd: FormData) {
  const fnIds = fd.getAll("positionFunctionId").map(String);
  const counts = fd.getAll("positionCount").map(String);
  return {
    title: fd.get("title"),
    type: fd.get("type"),
    date: fd.get("date"),
    startTime: fd.get("startTime"),
    endTime: fd.get("endTime") ?? "",
    location: fd.get("location") ?? "",
    theme: fd.get("theme") ?? "",
    notes: fd.get("notes") ?? "",
    confirmDeadline: fd.get("confirmDeadline") ?? "",
    rehearsalId: fd.get("rehearsalId") ?? "",
    repeat: fd.get("repeat") ?? "none",
    repeatUntil: fd.get("repeatUntil") ?? "",
    positions: fnIds.map((functionId, i) => ({ functionId, count: counts[i] ?? "0" })),
  };
}

async function ownedEvent(user: CurrentUser, id: string) {
  const ev = await db.select().from(events).where(and(eq(events.id, id), eq(events.organizationId, user.organizationId))).get();
  if (!ev) throw new UserError("Compromisso não encontrado.");
  return ev;
}

async function validFunctionIds(orgId: string) {
  const rows = await db.select({ id: functions.id }).from(functions).where(eq(functions.organizationId, orgId));
  return new Set(rows.map((r) => r.id));
}

export async function saveEventAction(id: string | null, _prev: unknown, fd: FormData): Promise<ActionResult> {
  let savedId = id;
  let createdCount = 1;
  const res = await runAction("saveEvent", async () => {
    const user = await assertAdmin();
    const input = eventSchema.parse(readEventForm(fd));
    const fnSet = await validFunctionIds(user.organizationId);
    if (input.positions.some((p) => !fnSet.has(p.functionId))) throw new UserError("Uma das funções escolhidas não existe mais.");
    if (input.rehearsalId) {
      const r = await db.select({ type: events.type }).from(events).where(and(eq(events.id, input.rehearsalId), eq(events.organizationId, user.organizationId))).get();
      if (!r || r.type !== "ensaio") throw new UserError("O ensaio escolhido não existe mais.");
    }
    const { positions, repeat, repeatUntil, ...values } = input;

    if (id) {
      const ev = await ownedEvent(user, id);
      if (ev.status === "cancelled") throw new UserError("Reative o compromisso antes de editá-lo.");
      await db.update(events).set(values).where(eq(events.id, id));
      await audit(user, "event.update", "event", id, `Editou "${values.title}" (${formatDate(values.date)})`);
      return { ok: true };
    }

    const slots = positions.flatMap((p) => Array.from({ length: p.count }, () => p.functionId));
    if (repeat !== "none" && repeatUntil) {
      // Evento recorrente: cria a regra e materializa as ocorrências (cada uma editável/cancelável).
      const day = Number(values.date.slice(8, 10));
      const isLast = addDays(values.date, 7).slice(0, 7) !== values.date.slice(0, 7);
      const nth = repeat === "monthly" ? (day > 28 || (isLast && day > 21) ? -1 : Math.ceil(day / 7)) : null;
      const [rule] = await db
        .insert(recurrenceRules)
        .values({ organizationId: user.organizationId, title: values.title, type: values.type, weekday: weekday(values.date), nthOfMonth: nth, startTime: values.startTime, endTime: values.endTime, location: values.location })
        .returning();
      const created = await materializeRule(user.organizationId, rule, values.date, repeatUntil, slots);
      if (!created.length) throw new UserError("Todas essas datas já têm um compromisso do mesmo tipo.");
      // Tema, observações, prazo e ensaio valem para a primeira ocorrência.
      await db.update(events).set({ theme: values.theme, notes: values.notes, confirmDeadline: values.confirmDeadline, rehearsalId: values.rehearsalId }).where(eq(events.id, created[0].id));
      savedId = created[0].id;
      createdCount = created.length;
      await audit(user, "event.create", "recurrence", rule.id, `Criou "${values.title}" recorrente (${created.length} datas até ${formatDate(repeatUntil)})`);
      return { ok: true };
    }

    await db.transaction(async (tx) => {
      const [row] = await tx.insert(events).values({ ...values, organizationId: user.organizationId }).returning({ id: events.id });
      savedId = row.id;
      if (slots.length) await tx.insert(eventSlots).values(slots.map((functionId, i) => ({ eventId: row.id, functionId, sortOrder: i })));
    });
    await audit(user, "event.create", "event", savedId, `Criou "${values.title}" (${formatDate(values.date)})`);
    return { ok: true };
  });
  if (!res.ok) return res;
  revalidatePath("/", "layout");
  await flash(id ? "Compromisso atualizado." : createdCount > 1 ? `${createdCount} datas criadas. Esta é a primeira.` : "Compromisso criado.");
  redirect(`/eventos/${savedId}`);
}

const statusSchema = z.enum(["draft", "pending", "published", "completed", "cancelled"]);

/**
 * Transições de status:
 *  publicar → "aguardando confirmação" (ou "publicado" se todos já confirmaram)
 *  concluir → registra no histórico as músicas executadas
 *  cancelar → mantém escala e repertório para histórico
 */
export async function setEventStatusAction(id: string, next: EventStatus, opts: { ignoreWarnings?: boolean } = {}): Promise<ActionResult> {
  return runAction("setEventStatus", async () => {
    const status = statusSchema.parse(next);
    // Publicar a escala: administração ou qualquer liderança. Concluir, cancelar, reabrir: só administração.
    const user = status === "pending" || status === "published" ? await assertCanPublish() : await assertAdmin();
    const ev = await ownedEvent(user, id);
    let finalStatus: EventStatus = status;

    if (status === "pending" || status === "published") {
      if (ev.status === "cancelled" || ev.status === "completed") throw new UserError("Reative o compromisso antes de publicar a escala.");
      const slots = await db.select().from(eventSlots).where(eq(eventSlots.eventId, id));
      const filled = slots.filter((s) => s.participantId || s.guestName);
      // Escala totalmente vazia nunca é publicada (nem com confirmação).
      if (filled.length === 0) throw new UserError("Esta escala ainda não tem ninguém escalado. Escolha ao menos uma pessoa antes de publicar.");
      const alerts = await computeEventAlerts(user.organizationId, ev);
      const errors = alerts.filter((a) => a.severity === "error");
      if (errors.length) throw new UserError(`Corrija antes de publicar: ${dedupeAlerts(errors).map((e) => e.message).join(" ")}`);
      const warnings = alerts.filter((a) => a.severity === "warning");
      if (warnings.length && !opts.ignoreWarnings) {
        const fnRows = await db.select({ id: functions.id, name: functions.name }).from(functions).where(eq(functions.organizationId, user.organizationId));
        const fnName = new Map(fnRows.map((f) => [f.id, f.name]));
        const missing = slots.filter((s) => s.required && !s.participantId && !s.guestName).map((s) => fnName.get(s.functionId) ?? "Função");
        const other = warnings.filter((w) => w.code !== "required-empty").length;
        return {
          ok: false,
          error: `Há avisos na escala.${missing.length ? ` Faltam: ${[...new Set(missing)].join(", ")}.` : ""}${other ? ` ${other} ${plural(other, "outro", "outros")} aviso(s) para revisar.` : ""} Confirme para publicar mesmo assim.`,
        };
      }
      finalStatus = filled.length > 0 && filled.every((s) => s.status === "confirmed") ? "published" : "pending";
    }

    await db.transaction(async (tx) => {
      await tx
        .update(events)
        .set({ status: finalStatus, publishedAt: finalStatus === "pending" || finalStatus === "published" ? (ev.publishedAt ?? new Date()) : ev.publishedAt })
        .where(eq(events.id, id));
      if (finalStatus === "completed") {
        const items = await tx.select().from(setlistItems).where(eq(setlistItems.eventId, id));
        if (items.length)
          await tx
            .insert(songPlays)
            .values(items.map((i) => ({ organizationId: user.organizationId, songId: i.songId, eventId: id, date: ev.date, key: i.key })))
            .onConflictDoNothing();
      } else if (ev.status === "completed") {
        // Reabrindo: remove o registro de execução deste evento.
        await tx.delete(songPlays).where(eq(songPlays.eventId, id));
      }
    });
    await audit(user, `event.${finalStatus}`, "event", id, `"${ev.title}" (${formatDate(ev.date)}) → ${EVENT_STATUS_LABELS[finalStatus]}`);
    revalidatePath("/", "layout");
    const msg: Record<EventStatus, string> = {
      draft: "Compromisso voltou para rascunho.",
      pending: "Escala publicada. Aguardando confirmações.",
      published: "Escala publicada.",
      completed: "Compromisso concluído. Músicas registradas no histórico.",
      cancelled: "Compromisso cancelado. A escala e o repertório foram mantidos no histórico.",
    };
    return { ok: true, message: msg[finalStatus] };
  });
}

/** Apenas rascunhos podem ser apagados (o resto é cancelado, preservando histórico). */
export async function deleteDraftEventAction(id: string): Promise<ActionResult> {
  const res = await runAction("deleteDraftEvent", async () => {
    const user = await assertAdmin();
    const ev = await ownedEvent(user, id);
    if (ev.status !== "draft") throw new UserError("Somente rascunhos podem ser apagados. Para os demais, use Cancelar.");
    if (ev.recurrenceId) throw new UserError("Esta data faz parte de uma série recorrente. Use Cancelar para tirá-la da agenda (o histórico fica guardado).");
    await db.delete(events).where(eq(events.id, id));
    await audit(user, "event.delete", "event", id, `Apagou rascunho "${ev.title}" (${formatDate(ev.date)})`);
    return { ok: true };
  });
  if (!res.ok) return res;
  revalidatePath("/", "layout");
  await flash("Rascunho apagado.");
  redirect("/agenda");
}

/** Copia posições (e pessoas, sem fixação) do compromisso anterior do mesmo tipo. */
export async function duplicatePreviousScheduleAction(id: string): Promise<ActionResult> {
  return runAction("duplicateSchedule", async () => {
    const user = await assertAdmin();
    const ev = await ownedEvent(user, id);
    const prev = await db
      .select()
      .from(events)
      .where(and(eq(events.organizationId, user.organizationId), eq(events.type, ev.type), lt(events.date, ev.date), ne(events.status, "cancelled"), ne(events.id, id)))
      .orderBy(desc(events.date))
      .limit(1)
      .get();
    if (!prev) throw new UserError("Não há compromisso anterior do mesmo tipo para copiar.");
    const prevSlots = await db.select().from(eventSlots).where(eq(eventSlots.eventId, prev.id)).orderBy(asc(eventSlots.sortOrder));
    if (!prevSlots.length) throw new UserError("O compromisso anterior não tem escala.");
    const current = await db.select({ id: eventSlots.id, participantId: eventSlots.participantId, guestName: eventSlots.guestName }).from(eventSlots).where(eq(eventSlots.eventId, id));
    if (current.some((s) => s.participantId || s.guestName)) throw new UserError("Esta escala já tem pessoas. Esvazie as posições antes de duplicar.");
    await db.transaction(async (tx) => {
      if (current.length) await tx.delete(eventSlots).where(inArray(eventSlots.id, current.map((c) => c.id)));
      await tx.insert(eventSlots).values(
        prevSlots.map((s) => ({ eventId: id, functionId: s.functionId, sortOrder: s.sortOrder, required: s.required, participantId: s.participantId, assignedBy: "manual" as const })),
      );
    });
    await audit(user, "schedule.duplicate", "event", id, `Duplicou a escala de ${formatDate(prev.date)} para ${formatDate(ev.date)}`);
    revalidatePath(`/eventos/${id}`, "layout");
    return { ok: true, message: `Escala copiada de ${formatDate(prev.date)}. Revise os alertas antes de publicar.` };
  });
}

/** Cria os compromissos de uma regra recorrente para um período (sem duplicar datas existentes). */
export async function createFromRecurrenceAction(ruleId: string, from: string, to: string): Promise<ActionResult<{ created: number }>> {
  return runAction("createFromRecurrence", async () => {
    const user = await assertAdmin();
    if (!isValidDate(from) || !isValidDate(to) || to < from) throw new UserError("Período inválido.");
    const rule = await db.select().from(recurrenceRules).where(and(eq(recurrenceRules.id, ruleId), eq(recurrenceRules.organizationId, user.organizationId))).get();
    if (!rule) throw new UserError("Regra não encontrada.");
    if (to > "2030-12-31") throw new UserError("Período muito longo.");
    const toCreate = await materializeRule(user.organizationId, rule, from, to);
    if (toCreate.length) await audit(user, "event.recurrence", "recurrence", rule.id, `Criou ${toCreate.length} ${plural(toCreate.length, "compromisso", "compromissos")} de "${rule.title}"`);
    revalidatePath("/", "layout");
    return {
      ok: true,
      data: { created: toCreate.length },
      message: toCreate.length ? `${toCreate.length} ${plural(toCreate.length, "compromisso", "compromissos")} ${plural(toCreate.length, "criado", "criados")} como rascunho.` : "Nenhuma data nova — todas já existiam.",
    };
  });
}

/**
 * Muda horário/local padrão de uma série e aplica às próximas ocorrências que
 * ainda seguem o horário antigo (ocorrências editadas individualmente são mantidas).
 */
export async function updateSeriesAction(ruleId: string, raw: { startTime: string; endTime: string; location: string; active: boolean }): Promise<ActionResult<{ updated: number }>> {
  return runAction("updateSeries", async () => {
    const user = await assertAdmin();
    const time = /^([01]\d|2[0-3]):[0-5]\d$/;
    const input = z
      .object({
        startTime: z.string().regex(time, "Horário inválido."),
        endTime: z.string().refine((v) => v === "" || time.test(v), "Horário inválido."),
        location: z.string().trim().max(120),
        active: z.boolean(),
      })
      .parse(raw);
    if (input.endTime && input.endTime <= input.startTime) throw new UserError("O término deve ser depois do início.");
    const rule = await db.select().from(recurrenceRules).where(and(eq(recurrenceRules.id, ruleId), eq(recurrenceRules.organizationId, user.organizationId))).get();
    if (!rule) throw new UserError("Série não encontrada.");
    const next = { startTime: input.startTime, endTime: input.endTime || null, location: input.location || null, active: input.active };
    await db.update(recurrenceRules).set(next).where(eq(recurrenceRules.id, ruleId));
    const updated = await db
      .update(events)
      .set({ startTime: next.startTime, endTime: next.endTime, location: next.location })
      .where(and(eq(events.recurrenceId, ruleId), eq(events.startTime, rule.startTime), sql`${events.date} >= ${todayIn()}`, ne(events.status, "cancelled"), ne(events.status, "completed")))
      .returning({ id: events.id });
    await audit(user, "recurrence.update", "recurrence", ruleId, `Alterou a série "${rule.title}" para ${next.startTime} (${updated.length} datas futuras)`);
    revalidatePath("/", "layout");
    return { ok: true, data: { updated: updated.length }, message: `Série atualizada. ${updated.length} ${plural(updated.length, "data", "datas")} futura(s) ajustada(s).` };
  });
}

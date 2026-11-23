"use server";

import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { formatDate, formatDayMonth, todayIn } from "@/domain/dates";
import { randomSeed, createRng } from "@/domain/random";
import { canCommit, planApply } from "@/domain/scheduling/apply";
import { generateSchedule } from "@/domain/scheduling/generate";
import type { Proposal, SchedEvent } from "@/domain/scheduling/types";
import { audit, runAction, UserError, type ActionResult } from "../action-utils";
import { areaOfKind, canEditArea, forbiddenAreas, AREA_LABELS, areasEditable, type Area, type SlotChange } from "@/domain/permissions";
import { assertLeader, assertUser } from "../auth/session";
import { db } from "../db/client";
import { eventSlots, events, functions, participantFunctions, participants, unavailability } from "../db/schema";
import { functionNameMap, getRules } from "../queries/core";
import { historyWindow, loadAssignments } from "../queries/events";
import { loadSchedParticipants } from "../queries/participants";
import { plural } from "@/lib/plural";

// ---------------------------------------------------------------------------
// Escala manual
// ---------------------------------------------------------------------------
const slotInput = z.object({
  id: z.string().nullable(),
  functionId: z.string().min(1),
  participantId: z.string().nullable(),
  /** Convidado de fora (só nome). Exclusivo com participantId. */
  guestName: z.string().trim().max(60, "Nome do convidado muito longo.").nullable().default(null),
  locked: z.boolean(),
  required: z.boolean().default(true),
  notes: z.string().trim().max(300).nullable().default(null),
});
const saveScheduleInput = z.object({
  eventId: z.string().min(1),
  slots: z.array(slotInput).max(40, "Muitas posições em um compromisso (máx. 40)."),
  scheduleLocked: z.boolean().optional(),
});

/** Garante que cada pessoa existe, está ativa e tem a função cadastrada. */
async function validateAssignments(orgId: string, list: { functionId: string; participantId: string | null; guestName?: string | null }[]) {
  const pids = [...new Set(list.map((s) => s.participantId).filter(Boolean) as string[])];
  const fnRows = await db.select({ id: functions.id, name: functions.name }).from(functions).where(eq(functions.organizationId, orgId));
  const fnNames = new Map(fnRows.map((f) => [f.id, f.name]));
  for (const s of list) {
    if (!fnNames.has(s.functionId)) throw new UserError("Função inexistente na escala. Recarregue a página.");
    if (s.participantId && s.guestName) throw new UserError("Uma posição não pode ter pessoa cadastrada e convidado ao mesmo tempo.");
  }
  if (!pids.length) return;
  const people = await db
    .select({ id: participants.id, name: participants.displayName, active: participants.active })
    .from(participants)
    .where(and(eq(participants.organizationId, orgId), inArray(participants.id, pids)));
  const byId = new Map(people.map((p) => [p.id, p]));
  const skills = await db.select().from(participantFunctions).where(inArray(participantFunctions.participantId, pids));
  for (const s of list) {
    if (!s.participantId) continue;
    const p = byId.get(s.participantId);
    if (!p) throw new UserError("Participante inexistente na escala.");
    if (!p.active) throw new UserError(`${p.name} está inativo(a) e não pode ser escalado(a).`);
    if (!skills.some((k) => k.participantId === p.id && k.functionId === s.functionId))
      throw new UserError(`${p.name} não tem ${fnNames.get(s.functionId)} cadastrado. Adicione no perfil da pessoa antes de escalar.`);
  }
}

/** Área (instrumental/vocal/técnica) de cada função da organização, a partir de functions.kind. */
async function areaByFunction(orgId: string): Promise<Map<string, Area>> {
  const rows = await db.select({ id: functions.id, kind: functions.kind }).from(functions).where(eq(functions.organizationId, orgId));
  return new Map(rows.map((r) => [r.id, areaOfKind(r.kind)]));
}

const slotSig = (s: { functionId: string; participantId: string | null; guestName: string | null; locked: boolean; required: boolean; notes: string | null }) =>
  [s.functionId, s.participantId ?? "", s.guestName ?? "", s.locked ? 1 : 0, s.required ? 1 : 0, s.notes ?? ""].join("|");

export async function saveScheduleAction(raw: z.input<typeof saveScheduleInput>): Promise<ActionResult> {
  return runAction("saveSchedule", async () => {
    const user = await assertLeader();
    const input = saveScheduleInput.parse(raw);
    const ev = await db.select().from(events).where(and(eq(events.id, input.eventId), eq(events.organizationId, user.organizationId))).get();
    if (!ev) throw new UserError("Compromisso não encontrado.");
    if (ev.status === "cancelled" || ev.status === "completed") throw new UserError("Compromisso cancelado ou concluído não pode ter a escala alterada.");
    const slotsIn = input.slots.map((s) => ({ ...s, guestName: s.guestName || null }));
    await validateAssignments(user.organizationId, slotsIn);

    const existing = await db.select().from(eventSlots).where(eq(eventSlots.eventId, ev.id));
    const existingById = new Map(existing.map((s) => [s.id, s]));
    if (slotsIn.some((s) => s.id && !existingById.has(s.id))) throw new UserError("A escala foi alterada em outro lugar. Recarregue a página.");
    const keep = new Set(slotsIn.map((s) => s.id).filter(Boolean));
    const removed = existing.filter((s) => !keep.has(s.id));

    // AUTORIZAÇÃO POR ÁREA (servidor): cada alteração, adição ou remoção precisa estar numa área que o usuário lidera.
    const area = await areaByFunction(user.organizationId);
    const changes: SlotChange[] = [
      ...slotsIn.map((s) => {
        const prev = s.id ? existingById.get(s.id) : undefined;
        return {
          before: prev ? { area: area.get(prev.functionId) ?? "other", sig: slotSig(prev) } : null,
          after: { area: area.get(s.functionId) ?? "other", sig: slotSig({ ...s, notes: s.notes || null }) },
        };
      }),
      ...removed.map((r) => ({ before: { area: area.get(r.functionId) ?? ("other" as Area), sig: slotSig(r) }, after: null })),
    ];
    const bad = forbiddenAreas(user, changes);
    if (bad.length) throw new UserError(`Você não pode alterar a escala de ${bad.map((a) => AREA_LABELS[a].toLowerCase()).join(" e ")}. Essa parte é da liderança responsável.`);
    if (input.scheduleLocked !== undefined && input.scheduleLocked !== ev.scheduleLocked && user.role !== "admin") throw new UserError("Só a administração pode bloquear a escala inteira.");

    await db.transaction(async (tx) => {
      if (removed.length) await tx.delete(eventSlots).where(inArray(eventSlots.id, removed.map((r) => r.id)));
      for (const [i, s] of slotsIn.entries()) {
        const prev = s.id ? existingById.get(s.id) : undefined;
        const personChanged = !prev || prev.participantId !== s.participantId || prev.guestName !== s.guestName || prev.functionId !== s.functionId;
        const filled = !!(s.participantId || s.guestName);
        const values = {
          functionId: s.functionId,
          participantId: s.participantId,
          guestName: s.guestName,
          locked: s.locked,
          required: s.required,
          notes: s.notes || null,
          sortOrder: i,
          // Convidado não usa o app: entra como confirmado (acerto feito pela liderança).
          ...(personChanged ? { status: s.guestName ? ("confirmed" as const) : ("pending" as const), respondedAt: null, declineReason: null, swapSuggestedParticipantId: null, assignedBy: filled ? ("manual" as const) : null } : {}),
        };
        if (prev) await tx.update(eventSlots).set(values).where(eq(eventSlots.id, prev.id));
        else await tx.insert(eventSlots).values({ ...values, eventId: ev.id });
      }
      if (input.scheduleLocked !== undefined) await tx.update(events).set({ scheduleLocked: input.scheduleLocked }).where(eq(events.id, ev.id));
      // Escala publicada que mudou volta a aguardar confirmação.
      if (ev.status === "published") await tx.update(events).set({ status: "pending" }).where(eq(events.id, ev.id));
    });
    const removedNames = removed.filter((r) => r.participantId || r.guestName).length;
    await audit(user, "schedule.save", "event", ev.id, `Salvou a escala de "${ev.title}" (${formatDate(ev.date)})${removedNames ? ` — ${removedNames} ${plural(removedNames, "pessoa", "pessoas")} removida(s)` : ""}`);
    revalidatePath(`/eventos/${ev.id}`, "layout");
    revalidatePath("/");
    return { ok: true, message: "Escala salva." };
  });
}

// ---------------------------------------------------------------------------
// Geração automática (prévia → revisão → aplicar)
// ---------------------------------------------------------------------------
const previewInput = z.object({
  eventIds: z.array(z.string()).min(1, "Escolha ao menos um compromisso.").max(120, "Máximo de 120 compromissos por geração."),
  scope: z.enum(["minister", "musicians", "all"]),
  mode: z.enum(["fill-empty", "replace-unlocked"]),
  excludedIds: z.array(z.string()).default([]),
  eligibleIds: z.array(z.string()).default([]),
  maxPerPerson: z.number().int().min(1).max(60).nullable().default(null),
  seed: z.number().int().nullable().default(null),
  /** Ajustes feitos na prévia que devem ser mantidos ao "gerar novamente". */
  pins: z.record(z.string(), z.string().nullable()).default({}),
});

export interface PreviewEvent {
  id: string;
  title: string;
  date: string;
  startTime: string;
  type: string;
  slots: { id: string; functionId: string; functionName: string; functionKind: string; locked: boolean; participantId: string | null; guestName: string | null }[];
}
export interface PreviewData {
  seed: number;
  events: PreviewEvent[];
  proposals: Proposal[];
  warnings: string[];
  counts: Record<string, number>;
  people: { id: string; name: string; functionIds: string[]; unavailableDates: string[] }[];
}

export async function previewGenerationAction(raw: z.input<typeof previewInput>): Promise<ActionResult<PreviewData>> {
  return runAction("previewGeneration", async () => {
    const user = await assertLeader();
    const input = previewInput.parse(raw);
    const orgId = user.organizationId;
    const evRows = await db
      .select()
      .from(events)
      .where(and(eq(events.organizationId, orgId), inArray(events.id, input.eventIds)))
      .orderBy(asc(events.date), asc(events.startTime));
    const usable = evRows.filter((e) => e.status !== "cancelled" && e.status !== "completed");
    if (!usable.length) throw new UserError("Nenhum compromisso aberto foi selecionado.");
    const slotRows = await db
      .select({ id: eventSlots.id, eventId: eventSlots.eventId, functionId: eventSlots.functionId, participantId: eventSlots.participantId, guestName: eventSlots.guestName, locked: eventSlots.locked, required: eventSlots.required, sortOrder: eventSlots.sortOrder, kind: functions.kind, fnName: functions.name })
      .from(eventSlots)
      .innerJoin(functions, eq(functions.id, eventSlots.functionId))
      .where(inArray(eventSlots.eventId, usable.map((e) => e.id)))
      .orderBy(asc(eventSlots.sortOrder));

    const from = usable[0].date;
    const to = usable[usable.length - 1].date;
    const win = historyWindow(from, to);
    const [people, history, rules, names] = await Promise.all([
      loadSchedParticipants(orgId, from, to),
      loadAssignments(orgId, win.from, win.to, usable.map((e) => e.id)),
      getRules(orgId),
      functionNameMap(orgId),
    ]);

    // A geração só toca nas áreas que o usuário pode editar (líder de vocais não gera a banda e vice-versa).
    const editable = new Set(areasEditable(user));
    const scopeFns = [
      ...new Set(
        slotRows
          .filter((s) => editable.has(areaOfKind(s.kind)))
          .filter((s) => (input.scope === "minister" ? s.kind === "minister" : input.scope === "musicians" ? s.kind !== "minister" : true))
          .map((s) => s.functionId),
      ),
    ];
    const schedEvents: SchedEvent[] = usable.map((e) => ({
      id: e.id,
      title: e.title,
      date: e.date,
      startTime: e.startTime,
      endTime: e.endTime,
      locked: e.scheduleLocked,
      slots: slotRows
        .filter((s) => s.eventId === e.id)
        .map((s) => {
          const pinned = Object.prototype.hasOwnProperty.call(input.pins, s.id);
          // Vaga de convidado é tratada como fixa: a geração nunca a preenche nem a troca.
          return { id: s.id, functionId: s.functionId, participantId: pinned ? input.pins[s.id] : s.participantId, locked: s.locked || pinned || !!s.guestName, required: s.required, sortOrder: s.sortOrder };
        }),
    }));
    const seed = input.seed ?? randomSeed();
    const result = generateSchedule(schedEvents, people, history, rules, {
      mode: input.mode,
      functionIds: scopeFns,
      excludedIds: input.excludedIds,
      eligibleIds: input.eligibleIds.length ? input.eligibleIds : undefined,
      maxPerPerson: input.maxPerPerson ?? undefined,
      rng: createRng(seed),
      functionNames: names,
    });
    // previousParticipantId sempre reflete o banco (não o ajuste da prévia).
    const dbParticipant = new Map(slotRows.map((s) => [s.id, s.participantId]));
    for (const p of result.proposals) {
      p.previousParticipantId = dbParticipant.get(p.slotId) ?? null;
      if (Object.prototype.hasOwnProperty.call(input.pins, p.slotId) && !slotRows.find((s) => s.id === p.slotId)?.locked) p.reason = "Ajustado por você nesta prévia.";
    }

    return {
      ok: true,
      data: {
        seed,
        events: usable.map((e) => ({
          id: e.id,
          title: e.title,
          date: e.date,
          startTime: e.startTime,
          type: e.type,
          slots: slotRows
            .filter((s) => s.eventId === e.id)
            .map((s) => ({ id: s.id, functionId: s.functionId, functionName: s.fnName, functionKind: s.kind, locked: s.locked || e.scheduleLocked || !!s.guestName, participantId: s.participantId, guestName: s.guestName })),
        })),
        proposals: result.proposals,
        warnings: result.warnings,
        counts: result.counts,
        people: people
          .filter((p) => p.active)
          .map((p) => ({
            id: p.id,
            name: p.name,
            functionIds: p.functionIds,
            unavailableDates: usable.filter((e) => p.unavailable.some((u) => u.start <= e.date && e.date <= u.end)).map((e) => e.date),
          })),
      },
    };
  });
}

const applyInput = z.object({
  changes: z
    .array(z.object({ slotId: z.string(), previousParticipantId: z.string().nullable(), participantId: z.string().nullable(), lock: z.boolean().default(false), auto: z.boolean().default(true) }))
    .max(2000),
  confirmReplace: z.boolean().default(false),
});

export async function applyGenerationAction(raw: z.input<typeof applyInput>): Promise<ActionResult<{ needsConfirmation: number; stale: number }>> {
  return runAction("applyGeneration", async () => {
    const user = await assertLeader();
    const input = applyInput.parse(raw);
    const slotIds = input.changes.map((c) => c.slotId);
    if (!slotIds.length) return { ok: true, message: "Nada para aplicar." };
    const current = await db
      .select({ id: eventSlots.id, participantId: eventSlots.participantId, guestName: eventSlots.guestName, locked: eventSlots.locked, functionId: eventSlots.functionId, eventId: eventSlots.eventId, scheduleLocked: events.scheduleLocked, status: events.status, orgId: events.organizationId })
      .from(eventSlots)
      .innerJoin(events, eq(events.id, eventSlots.eventId))
      .where(inArray(eventSlots.id, slotIds));
    if (current.some((c) => c.orgId !== user.organizationId) || current.length !== new Set(slotIds).size) throw new UserError("Algumas posições não existem mais. Gere uma nova prévia.");
    if (current.some((c) => c.status === "cancelled" || c.status === "completed")) throw new UserError("A prévia inclui compromisso cancelado ou concluído.");
    // AUTORIZAÇÃO POR ÁREA (servidor): nada de posição fora das áreas do usuário, mesmo que a prévia venha adulterada.
    const areaOf = await areaByFunction(user.organizationId);
    if (current.some((c) => !canEditArea(user, areaOf.get(c.functionId) ?? "other"))) throw new UserError("A prévia inclui posições que não são da sua liderança. Gere uma nova prévia.");

    const plan = planApply(
      current.map((c) => ({ id: c.id, participantId: c.participantId, locked: c.locked || c.scheduleLocked || !!c.guestName })),
      input.changes,
      { confirmReplace: input.confirmReplace },
    );
    if (!canCommit(plan)) {
      if (plan.stale.length) return { ok: false, error: `${plan.stale.length} ${plural(plan.stale.length, "posição", "posições")} mudaram depois da prévia. Gere novamente para não sobrescrever alterações.` };
      return { ok: false, error: `${plan.needsConfirmation.length} ${plural(plan.needsConfirmation.length, "pessoa", "pessoas")} já escalada(s) seriam substituída(s). Confirme a substituição para continuar.` };
    }
    const byId = new Map(current.map((c) => [c.id, c]));
    await validateAssignments(
      user.organizationId,
      plan.updates.map((u) => ({ functionId: byId.get(u.slotId)!.functionId, participantId: u.participantId })),
    );
    const changeById = new Map(input.changes.map((c) => [c.slotId, c]));
    await db.transaction(async (tx) => {
      for (const u of plan.updates) {
        const ch = changeById.get(u.slotId)!;
        await tx
          .update(eventSlots)
          .set({ participantId: u.participantId, assignedBy: u.participantId ? (ch.auto ? "auto" : "manual") : null, status: "pending", respondedAt: null, declineReason: null, swapSuggestedParticipantId: null, locked: ch.lock })
          .where(eq(eventSlots.id, u.slotId));
      }
      // Fixações pedidas na prévia em posições que não mudaram.
      for (const ch of input.changes) {
        if (ch.lock && !plan.updates.some((u) => u.slotId === ch.slotId) && !byId.get(ch.slotId)!.locked) await tx.update(eventSlots).set({ locked: true }).where(eq(eventSlots.id, ch.slotId));
      }
    });
    const eventIds = [...new Set(current.map((c) => c.eventId))];
    await audit(user, input.confirmReplace ? "schedule.regenerate" : "schedule.generate", "event", eventIds.length === 1 ? eventIds[0] : null, `Aplicou geração automática: ${plan.updates.length} ${plural(plan.updates.length, "posição", "posições")} em ${eventIds.length} ${plural(eventIds.length, "compromisso", "compromissos")}${input.confirmReplace ? " (com substituições confirmadas)" : ""}`);
    revalidatePath("/", "layout");
    return { ok: true, message: plan.updates.length ? `Escala salva: ${plan.updates.length} ${plural(plan.updates.length, "posição", "posições")} atualizada(s).` : "Nenhuma alteração necessária." };
  });
}

// ---------------------------------------------------------------------------
// Confirmação de participação (ministro/músico)
// ---------------------------------------------------------------------------
const respondInput = z.object({
  slotId: z.string().min(1),
  response: z.enum(["confirmed", "declined", "pending"]),
  reason: z.string().trim().max(200).optional(),
  /** "Preciso trocar": colega sugerido para ir no lugar (opcional; a liderança decide). */
  suggestedParticipantId: z.string().optional(),
});

export async function respondToSlotAction(raw: z.input<typeof respondInput>): Promise<ActionResult> {
  return runAction("respondToSlot", async () => {
    const user = await assertUser();
    const input = respondInput.parse(raw);
    const row = await db
      .select({ slot: eventSlots, ev: events })
      .from(eventSlots)
      .innerJoin(events, eq(events.id, eventSlots.eventId))
      .where(and(eq(eventSlots.id, input.slotId), eq(events.organizationId, user.organizationId)))
      .get();
    if (!row) throw new UserError("Escala não encontrada.");
    if (!user.participantId || row.slot.participantId !== user.participantId) throw new UserError("Você só pode responder às suas próprias escalas.");
    if (row.ev.status !== "pending" && row.ev.status !== "published") throw new UserError("Esta escala não está aberta para confirmação.");
    if (row.ev.date < todayIn()) throw new UserError("Este compromisso já passou.");

    let suggested: string | null = null;
    if (input.response === "declined" && input.suggestedParticipantId) {
      const ok = await swapCandidates(user.organizationId, row.ev.id, row.ev.date, row.slot.functionId, user.participantId);
      if (!ok.some((c) => c.id === input.suggestedParticipantId)) throw new UserError("Essa pessoa não pode ser sugerida para esta função e data. Escolha outra.");
      suggested = input.suggestedParticipantId;
    }

    await db.transaction(async (tx) => {
      await tx
        .update(eventSlots)
        .set({ status: input.response, respondedAt: input.response === "pending" ? null : new Date(), declineReason: input.response === "declined" ? (input.reason ?? null) : null, swapSuggestedParticipantId: suggested })
        .where(eq(eventSlots.id, input.slotId));
      const slots = await tx.select({ participantId: eventSlots.participantId, status: eventSlots.status }).from(eventSlots).where(eq(eventSlots.eventId, row.ev.id));
      const filled = slots.filter((s) => s.participantId);
      const allConfirmed = filled.length > 0 && filled.every((s) => s.status === "confirmed");
      await tx.update(events).set({ status: allConfirmed ? "published" : "pending" }).where(eq(events.id, row.ev.id));
    });
    await audit(user, `slot.${input.response}`, "event", row.ev.id, `${user.participantName ?? user.name} ${input.response === "confirmed" ? "confirmou" : input.response === "declined" ? "recusou" : "marcou como pendente"} ${row.ev.title} (${formatDayMonth(row.ev.date)})`);
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: input.response === "confirmed" ? "Presença confirmada. Obrigado!" : input.response === "declined" ? (suggested ? "Troca solicitada. A liderança vai avaliar a sua sugestão." : "Troca solicitada. A liderança foi avisada para encontrar substituto.") : "Resposta desfeita.",
    };
  });
}

// ---------------------------------------------------------------------------
// "Preciso trocar": sugestão de substituto
// ---------------------------------------------------------------------------
/** Quem pode ser sugerido: ativo, com a função, livre naquele dia e ainda fora do culto. Só nomes (privacidade). */
async function swapCandidates(orgId: string, eventId: string, date: string, functionId: string, exceptParticipantId: string | null) {
  const [people, inEvent, unav] = await Promise.all([
    db
      .select({ id: participants.id, name: participants.displayName })
      .from(participants)
      .innerJoin(participantFunctions, eq(participantFunctions.participantId, participants.id))
      .where(and(eq(participants.organizationId, orgId), eq(participants.active, true), eq(participantFunctions.functionId, functionId)))
      .orderBy(asc(participants.displayName)),
    db.select({ pid: eventSlots.participantId }).from(eventSlots).where(eq(eventSlots.eventId, eventId)),
    db.select({ pid: unavailability.participantId }).from(unavailability).where(and(eq(unavailability.organizationId, orgId), lte(unavailability.startDate, date), gte(unavailability.endDate, date))),
  ]);
  const busy = new Set([...inEvent.map((x) => x.pid), ...unav.map((x) => x.pid), exceptParticipantId]);
  return people.filter((p) => !busy.has(p.id));
}

export async function listSwapCandidatesAction(slotId: string): Promise<ActionResult<{ id: string; name: string }[]>> {
  return runAction("listSwapCandidates", async () => {
    const user = await assertUser();
    const row = await db
      .select({ slot: eventSlots, ev: events })
      .from(eventSlots)
      .innerJoin(events, eq(events.id, eventSlots.eventId))
      .where(and(eq(eventSlots.id, slotId), eq(events.organizationId, user.organizationId)))
      .get();
    if (!row || !user.participantId || row.slot.participantId !== user.participantId) throw new UserError("Você só pode pedir troca da sua própria escala.");
    return { ok: true, data: await swapCandidates(user.organizationId, row.ev.id, row.ev.date, row.slot.functionId, user.participantId) };
  });
}

/** Liderança da área aceita a sugestão: a pessoa sugerida assume a posição e passa a aguardar confirmação. */
export async function acceptSwapSuggestionAction(slotId: string): Promise<ActionResult> {
  return runAction("acceptSwap", async () => {
    const user = await assertLeader();
    const row = await db
      .select({ slot: eventSlots, ev: events })
      .from(eventSlots)
      .innerJoin(events, eq(events.id, eventSlots.eventId))
      .where(and(eq(eventSlots.id, slotId), eq(events.organizationId, user.organizationId)))
      .get();
    if (!row) throw new UserError("Posição não encontrada.");
    const area = (await areaByFunction(user.organizationId)).get(row.slot.functionId) ?? "other";
    if (!canEditArea(user, area)) throw new UserError("Essa posição é da outra liderança.");
    if (row.ev.status === "cancelled" || row.ev.status === "completed") throw new UserError("Compromisso cancelado ou concluído não pode ter a escala alterada.");
    const suggested = row.slot.swapSuggestedParticipantId;
    if (row.slot.status !== "declined" || !suggested) throw new UserError("Não há sugestão de troca para aceitar nesta posição.");
    await validateAssignments(user.organizationId, [{ functionId: row.slot.functionId, participantId: suggested }]);
    const free = await swapCandidates(user.organizationId, row.ev.id, row.ev.date, row.slot.functionId, null);
    if (!free.some((c) => c.id === suggested)) throw new UserError("A pessoa sugerida não está mais livre para esta data. Escolha outra na escala.");
    await db.transaction(async (tx) => {
      await tx
        .update(eventSlots)
        .set({ participantId: suggested, status: "pending", respondedAt: null, declineReason: null, swapSuggestedParticipantId: null, assignedBy: "manual", locked: false })
        .where(eq(eventSlots.id, slotId));
      if (row.ev.status === "published") await tx.update(events).set({ status: "pending" }).where(eq(events.id, row.ev.id));
    });
    await audit(user, "slot.swap", "event", row.ev.id, `Aceitou a troca sugerida em "${row.ev.title}" (${formatDayMonth(row.ev.date)})`);
    revalidatePath("/", "layout");
    return { ok: true, message: "Troca aceita. A pessoa sugerida precisa confirmar." };
  });
}

"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { participantSchema, unavailabilitySchema } from "@/lib/validation";
import { audit, flash, runAction, UserError, type ActionResult } from "../action-utils";
import { hashPassword } from "../auth/password";
import { assertAdmin, assertUser } from "../auth/session";
import { db } from "../db/client";
import { eventSlots, functions, participantFunctions, participants, unavailability, users } from "../db/schema";

function readParticipantForm(fd: FormData) {
  return {
    fullName: fd.get("fullName"),
    displayName: fd.get("displayName") ?? "",
    email: fd.get("email") ?? "",
    phone: fd.get("phone") ?? "",
    level: fd.get("level") ?? "",
    monthlyLimit: fd.get("monthlyLimit") ?? "",
    notes: fd.get("notes") ?? "",
    active: fd.get("active") ?? "",
    usualDays: fd.getAll("usualDays"),
    functionIds: fd.getAll("functionIds"),
    primaryFunctionId: fd.get("primaryFunctionId") ?? "",
    createAccess: fd.get("createAccess") ?? "",
    password: fd.get("password") ?? "",
    role: fd.get("role") ?? "member",
  };
}

export async function saveParticipantAction(id: string | null, _prev: unknown, fd: FormData): Promise<ActionResult> {
  let savedId = id;
  const result = await runAction("saveParticipant", async () => {
    const user = await assertAdmin();
    const input = participantSchema.parse(readParticipantForm(fd));
    const orgId = user.organizationId;

    // Funções precisam existir e pertencer à organização.
    const validFns = await db.select({ id: functions.id }).from(functions).where(eq(functions.organizationId, orgId));
    const validSet = new Set(validFns.map((f) => f.id));
    const fnIds = [...new Set(input.functionIds)].filter((f) => validSet.has(f));
    if (fnIds.length !== new Set(input.functionIds).size) throw new UserError("Uma das funções selecionadas não existe mais. Recarregue a página.");
    const primary = input.primaryFunctionId && fnIds.includes(input.primaryFunctionId) ? input.primaryFunctionId : (fnIds[0] ?? null);

    const values = {
      fullName: input.fullName,
      displayName: input.displayName || input.fullName.split(" ")[0],
      email: input.email,
      phone: input.phone,
      level: input.level,
      monthlyLimit: input.monthlyLimit,
      notes: input.notes,
      active: id ? input.active : true,
      usualDays: [...new Set(input.usualDays)].sort(),
    };

    if (input.createAccess) {
      if (!input.email) return { ok: false, error: "Informe o e-mail para criar o acesso.", fieldErrors: { email: "Obrigatório para acesso ao app." } };
      const existing = await db.select({ id: users.id, participantId: users.participantId }).from(users).where(eq(users.email, input.email)).get();
      if (existing && existing.participantId !== id) return { ok: false, error: "Este e-mail já está em uso por outro acesso.", fieldErrors: { email: "E-mail já usado." } };
      if (!existing && !input.password) return { ok: false, error: "Defina uma senha inicial para o acesso.", fieldErrors: { password: "Obrigatória para criar o acesso." } };
    }

    // Papel no sistema → role + marcas de liderança (independente das funções musicais).
    const perms = {
      role: input.role === "admin" ? ("admin" as const) : ("member" as const),
      leadsInstrumental: input.role === "lead_instrumental" || input.role === "lead_both",
      leadsVocal: input.role === "lead_vocal" || input.role === "lead_both",
    };
    // Nunca deixar a organização sem administrador ativo.
    if (id) {
      const acct = await db.select({ id: users.id, role: users.role }).from(users).where(and(eq(users.participantId, id), eq(users.organizationId, orgId))).get();
      const losesAdmin = acct?.role === "admin" && ((input.createAccess && perms.role !== "admin") || !values.active);
      if (losesAdmin) {
        const others = await db.select({ id: users.id }).from(users).where(and(eq(users.organizationId, orgId), eq(users.role, "admin"), eq(users.active, true), ne(users.id, acct!.id)));
        if (!others.length) throw new UserError("Esta é a única pessoa administradora. Torne outra pessoa administradora antes de mudar este acesso.");
      }
    }

    await db.transaction(async (tx) => {
      if (id) {
        const found = await tx.select({ id: participants.id }).from(participants).where(and(eq(participants.id, id), eq(participants.organizationId, orgId))).get();
        if (!found) throw new UserError("Participante não encontrado.");
        await tx.update(participants).set(values).where(eq(participants.id, id));
        await tx.delete(participantFunctions).where(eq(participantFunctions.participantId, id));
      } else {
        const [row] = await tx.insert(participants).values({ ...values, organizationId: orgId }).returning({ id: participants.id });
        savedId = row.id;
      }
      if (fnIds.length) await tx.insert(participantFunctions).values(fnIds.map((functionId) => ({ participantId: savedId!, functionId, isPrimary: functionId === primary })));

      if (input.createAccess && input.email) {
        const existing = await tx.select({ id: users.id }).from(users).where(eq(users.participantId, savedId!)).get();
        if (existing) {
          await tx
            .update(users)
            .set({ email: input.email, name: values.fullName, ...perms, active: values.active, ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}) })
            .where(eq(users.id, existing.id));
        } else {
          await tx.insert(users).values({ organizationId: orgId, email: input.email, name: values.fullName, ...perms, participantId: savedId!, passwordHash: await hashPassword(input.password!) });
        }
      } else if (id) {
        // Mantém o acesso existente sincronizado com o status do participante.
        await tx.update(users).set({ active: values.active }).where(eq(users.participantId, id));
      }
    });

    await audit(user, id ? "participant.update" : "participant.create", "participant", savedId, `${id ? "Editou" : "Cadastrou"} ${values.displayName}`);
    return { ok: true };
  });
  if (!result.ok) return result;
  revalidatePath("/pessoas");
  await flash(id ? "Participante atualizado." : "Participante adicionado.");
  redirect(`/pessoas/${savedId}`);
}

export async function setParticipantActiveAction(id: string, active: boolean): Promise<ActionResult> {
  return runAction("setParticipantActive", async () => {
    const user = await assertAdmin();
    const p = await db.select().from(participants).where(and(eq(participants.id, id), eq(participants.organizationId, user.organizationId))).get();
    if (!p) throw new UserError("Participante não encontrado.");
    await db.update(participants).set({ active }).where(eq(participants.id, id));
    await db.update(users).set({ active }).where(eq(users.participantId, id));
    await audit(user, active ? "participant.activate" : "participant.deactivate", "participant", id, `${active ? "Reativou" : "Desativou"} ${p.displayName}`);
    revalidatePath("/pessoas");
    revalidatePath(`/pessoas/${id}`);
    return { ok: true, message: active ? "Participante reativado." : "Participante desativado. O histórico foi mantido." };
  });
}

/** Exclusão definitiva só quando não há histórico; caso contrário, orienta desativar. */
export async function deleteParticipantAction(id: string): Promise<ActionResult> {
  const res = await runAction("deleteParticipant", async () => {
    const user = await assertAdmin();
    const p = await db.select().from(participants).where(and(eq(participants.id, id), eq(participants.organizationId, user.organizationId))).get();
    if (!p) throw new UserError("Participante não encontrado.");
    const used = await db.select({ id: eventSlots.id }).from(eventSlots).where(eq(eventSlots.participantId, id)).limit(1).get();
    if (used) throw new UserError("Esta pessoa já participou de escalas. Desative em vez de excluir para manter o histórico.");
    const acc = await db.select({ id: users.id }).from(users).where(and(eq(users.participantId, id), ne(users.id, user.id))).get();
    await db.transaction(async (tx) => {
      if (acc) await tx.delete(users).where(eq(users.id, acc.id));
      await tx.delete(participants).where(eq(participants.id, id));
    });
    await audit(user, "participant.delete", "participant", id, `Excluiu ${p.displayName}`);
    return { ok: true };
  });
  if (!res.ok) return res;
  revalidatePath("/pessoas");
  await flash("Participante excluído.");
  redirect("/pessoas");
}

/** Indisponibilidade: a própria pessoa ou um administrador. */
export async function addUnavailabilityAction(_prev: unknown, fd: FormData): Promise<ActionResult> {
  return runAction("addUnavailability", async () => {
    const user = await assertUser();
    const input = unavailabilitySchema.parse({
      participantId: fd.get("participantId"),
      startDate: fd.get("startDate"),
      endDate: fd.get("endDate") ?? "",
      reason: fd.get("reason") ?? "",
    });
    if (user.role !== "admin" && user.participantId !== input.participantId) throw new UserError("Você só pode alterar a sua própria disponibilidade.");
    const p = await db.select({ id: participants.id }).from(participants).where(and(eq(participants.id, input.participantId), eq(participants.organizationId, user.organizationId))).get();
    if (!p) throw new UserError("Participante não encontrado.");
    await db.insert(unavailability).values({ ...input, organizationId: user.organizationId });
    revalidatePath("/disponibilidade");
    revalidatePath(`/pessoas/${input.participantId}`);
    return { ok: true, message: "Indisponibilidade registrada." };
  });
}

export async function removeUnavailabilityAction(id: string): Promise<ActionResult> {
  return runAction("removeUnavailability", async () => {
    const user = await assertUser();
    const row = await db.select().from(unavailability).where(and(eq(unavailability.id, id), eq(unavailability.organizationId, user.organizationId))).get();
    if (!row) throw new UserError("Registro não encontrado.");
    if (user.role !== "admin" && user.participantId !== row.participantId) throw new UserError("Você só pode alterar a sua própria disponibilidade.");
    await db.delete(unavailability).where(eq(unavailability.id, id));
    revalidatePath("/disponibilidade");
    revalidatePath(`/pessoas/${row.participantId}`);
    return { ok: true, message: "Indisponibilidade removida." };
  });
}

"use server";

import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit, runAction, UserError, type ActionResult } from "../action-utils";
import { hashPassword } from "../auth/password";
import { clientIp, isLimited, registerHit } from "../auth/rate-limit";
import { assertAdmin } from "../auth/session";
import { appBaseUrl } from "../auth/base-url";
import { generateToken, hashToken } from "../auth/tokens";
import { db } from "../db/client";
import { functions, invites, participantFunctions, participants, passwordResets, registrations, sessions, users } from "../db/schema";


// ---------------------------------------------------------------------------
// Convites (líder gera o link e envia no grupo)
// ---------------------------------------------------------------------------
export async function createInviteAction(days: number): Promise<ActionResult<{ url: string }>> {
  return runAction("createInvite", async () => {
    const user = await assertAdmin();
    const validDays = z.number().int().min(1).max(30).parse(days);
    const token = generateToken();
    await db.insert(invites).values({ organizationId: user.organizationId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + validDays * 86_400_000), createdBy: user.id });
    await audit(user, "invite.create", "invite", null, `Criou link de convite (${validDays} dias)`);
    revalidatePath("/pessoas/solicitacoes");
    return { ok: true, data: { url: `${await appBaseUrl()}/convite/${token}` }, message: "Link criado. Copie agora — por segurança ele não é exibido novamente." };
  });
}

export async function revokeInviteAction(id: string): Promise<ActionResult> {
  return runAction("revokeInvite", async () => {
    const user = await assertAdmin();
    await db.update(invites).set({ revokedAt: new Date() }).where(and(eq(invites.id, id), eq(invites.organizationId, user.organizationId)));
    await audit(user, "invite.revoke", "invite", id, "Revogou um link de convite");
    revalidatePath("/pessoas/solicitacoes");
    return { ok: true, message: "Convite revogado. O link não funciona mais." };
  });
}

// ---------------------------------------------------------------------------
// Cadastro pelo membro (público, protegido pelo token do convite)
// ---------------------------------------------------------------------------
const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, "Informe seu nome completo.").max(120, "Nome muito longo."),
    displayName: z.string().trim().max(40, "Use no máximo 40 caracteres.").optional().default(""),
    email: z.string().trim().toLowerCase().pipe(z.email("E-mail inválido.")),
    phone: z.string().trim().max(30, "Telefone muito longo.").optional().default(""),
    functionIds: z.array(z.string().min(1)).min(1, "Escolha ao menos uma função ou instrumento.").max(8, "Escolha no máximo 8."),
    password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres.").max(100, "Senha muito longa."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "As senhas não conferem.", path: ["confirm"] });

async function validInvite(token: string) {
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return null;
  return (
    (await db
      .select()
      .from(invites)
      .where(and(eq(invites.tokenHash, hashToken(token)), isNull(invites.revokedAt), gt(invites.expiresAt, new Date())))
      .get()) ?? null
  );
}

export async function registerAction(token: string, _prev: unknown, fd: FormData): Promise<ActionResult> {
  return runAction(
    "register",
    async () => {
      const key = `reg|${await clientIp()}`;
      if (await isLimited(key, 10)) throw new UserError("Muitas tentativas. Aguarde alguns minutos e tente novamente.");
      const invite = await validInvite(token);
      if (!invite) throw new UserError("Este convite expirou ou foi cancelado. Peça um novo link ao líder.");
      await registerHit(key);

      const input = registerSchema.parse({
        fullName: fd.get("fullName"),
        displayName: fd.get("displayName") ?? "",
        email: fd.get("email"),
        phone: fd.get("phone") ?? "",
        functionIds: fd.getAll("functionIds"),
        password: fd.get("password"),
        confirm: fd.get("confirm"),
      });
      const orgId = invite.organizationId;
      const valid = new Set((await db.select({ id: functions.id }).from(functions).where(and(eq(functions.organizationId, orgId), eq(functions.active, true)))).map((f) => f.id));
      const fnIds = [...new Set(input.functionIds)];
      if (fnIds.some((f) => !valid.has(f))) throw new UserError("Alguma função escolhida não existe mais. Recarregue a página.");

      const dupUser = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).get();
      const dupReg = await db.select({ id: registrations.id }).from(registrations).where(and(eq(registrations.organizationId, orgId), eq(registrations.email, input.email))).get();
      if (dupUser || dupReg) return { ok: false, error: "Este e-mail já tem cadastro ou está aguardando aprovação.", fieldErrors: { email: "E-mail já cadastrado." } };

      await db.insert(registrations).values({
        organizationId: orgId,
        fullName: input.fullName,
        displayName: input.displayName || input.fullName.split(" ")[0],
        email: input.email,
        phone: input.phone || null,
        passwordHash: await hashPassword(input.password),
        functionIds: fnIds,
      });
      return { ok: true, message: "Cadastro enviado! Assim que a liderança aprovar, você já poderá entrar com seu e-mail e senha." };
    },
    "Não foi possível enviar o cadastro. Verifique os dados e tente novamente.",
  );
}

// ---------------------------------------------------------------------------
// Aprovação (líder)
// ---------------------------------------------------------------------------
export async function approveRegistrationAction(id: string): Promise<ActionResult> {
  return runAction("approveRegistration", async () => {
    const user = await assertAdmin();
    const reg = await db.select().from(registrations).where(and(eq(registrations.id, id), eq(registrations.organizationId, user.organizationId))).get();
    if (!reg) throw new UserError("Solicitação não encontrada (talvez já tenha sido tratada).");
    const dup = await db.select({ id: users.id }).from(users).where(eq(users.email, reg.email)).get();
    if (dup) throw new UserError("Já existe um acesso com este e-mail. Recuse esta solicitação.");
    const existing = reg.functionIds.length ? await db.select({ id: functions.id }).from(functions).where(and(eq(functions.organizationId, user.organizationId), inArray(functions.id, reg.functionIds))) : [];
    const fnIds = existing.map((f) => f.id);

    await db.transaction(async (tx) => {
      const [p] = await tx.insert(participants).values({ organizationId: user.organizationId, fullName: reg.fullName, displayName: reg.displayName, email: reg.email, phone: reg.phone }).returning({ id: participants.id });
      if (fnIds.length) await tx.insert(participantFunctions).values(fnIds.map((functionId, i) => ({ participantId: p.id, functionId, isPrimary: i === 0 })));
      await tx.insert(users).values({ organizationId: user.organizationId, email: reg.email, name: reg.fullName, role: "member", participantId: p.id, passwordHash: reg.passwordHash });
      await tx.delete(registrations).where(eq(registrations.id, id));
    });
    await audit(user, "registration.approve", "participant", null, `Aprovou o cadastro de ${reg.displayName}`);
    revalidatePath("/", "layout");
    return { ok: true, message: `${reg.displayName} aprovado(a). Já pode entrar no app.` };
  });
}

export async function rejectRegistrationAction(id: string): Promise<ActionResult> {
  return runAction("rejectRegistration", async () => {
    const user = await assertAdmin();
    const reg = await db.select().from(registrations).where(and(eq(registrations.id, id), eq(registrations.organizationId, user.organizationId))).get();
    if (!reg) throw new UserError("Solicitação não encontrada.");
    await db.delete(registrations).where(eq(registrations.id, id));
    await audit(user, "registration.reject", "participant", null, `Recusou o cadastro de ${reg.displayName}`);
    revalidatePath("/", "layout");
    return { ok: true, message: "Solicitação recusada e removida." };
  });
}

// ---------------------------------------------------------------------------
// Redefinição de senha por link (gerado pelo líder, enviado por WhatsApp)
// ---------------------------------------------------------------------------
export async function createPasswordResetAction(participantId: string): Promise<ActionResult<{ url: string }>> {
  return runAction("createPasswordReset", async () => {
    const admin = await assertAdmin();
    const target = await db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.participantId, participantId), eq(users.organizationId, admin.organizationId))).get();
    if (!target) throw new UserError("Esta pessoa ainda não tem acesso ao app. Ative em Editar → Acesso ao aplicativo.");
    const token = generateToken();
    await db.insert(passwordResets).values({ userId: target.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 48 * 3_600_000), createdBy: admin.id });
    await audit(admin, "password.reset-link", "user", target.id, `Gerou link de redefinição de senha para ${target.name}`);
    return { ok: true, data: { url: `${await appBaseUrl()}/redefinir/${token}` }, message: "Link criado (válido por 48 horas). Copie agora e envie à pessoa." };
  });
}

const resetSchema = z
  .object({
    password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres.").max(100, "Senha muito longa."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "As senhas não conferem.", path: ["confirm"] });

export async function resetPasswordAction(token: string, _prev: unknown, fd: FormData): Promise<ActionResult> {
  return runAction("resetPassword", async () => {
    const key = `reset|${await clientIp()}`;
    if (await isLimited(key, 10)) throw new UserError("Muitas tentativas. Aguarde alguns minutos e tente novamente.");
    await registerHit(key);
    const row = /^[A-Za-z0-9_-]{32,64}$/.test(token)
      ? await db
          .select({ id: passwordResets.id, userId: passwordResets.userId, active: users.active })
          .from(passwordResets)
          .innerJoin(users, eq(users.id, passwordResets.userId))
          .where(and(eq(passwordResets.tokenHash, hashToken(token)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, new Date())))
          .get()
      : undefined;
    if (!row || !row.active) throw new UserError("Este link expirou ou já foi usado. Peça um novo ao líder.");
    const input = resetSchema.parse({ password: fd.get("password"), confirm: fd.get("confirm") });
    const hash = await hashPassword(input.password);
    await db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash: hash }).where(eq(users.id, row.userId));
      await tx.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, row.id));
      await tx.delete(sessions).where(eq(sessions.userId, row.userId)); // encerra sessões antigas
    });
    return { ok: true, message: "Senha alterada! Agora é só entrar com a nova senha." };
  });
}

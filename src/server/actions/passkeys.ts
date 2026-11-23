"use server";

import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { and, eq, lt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { APP } from "@/config/app";
import { audit, runAction, UserError, type ActionResult } from "../action-utils";
import { assertUser, createSession } from "../auth/session";
import { CHALLENGE_TTL_MS, deviceLabel, fromBase64Url, relyingPartyFrom, toBase64Url } from "../auth/passkey-utils";
import { clientIp, isLimited, registerHit } from "../auth/rate-limit";
import { db } from "../db/client";
import { passkeyChallenges, passkeys, users } from "../db/schema";

async function rp() {
  const h = await headers();
  return relyingPartyFrom(h.get("host"), h.get("x-forwarded-host"), h.get("x-forwarded-proto"));
}

/** Desafio de uso único: guardado no servidor, consumido (apagado) ao ser verificado, vale 5 minutos. */
async function newChallenge(challenge: string, purpose: "register" | "login", userId: string | null) {
  await db.delete(passkeyChallenges).where(lt(passkeyChallenges.expiresAt, new Date())); // limpeza oportunista
  const [row] = await db.insert(passkeyChallenges).values({ challenge, purpose, userId, expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) }).returning({ id: passkeyChallenges.id });
  return row.id;
}
async function consumeChallenge(id: string, purpose: "register" | "login", userId: string | null) {
  const row = await db.select().from(passkeyChallenges).where(eq(passkeyChallenges.id, id)).get();
  if (row) await db.delete(passkeyChallenges).where(eq(passkeyChallenges.id, id)); // uma tentativa por desafio
  if (!row || row.purpose !== purpose || row.expiresAt.getTime() < Date.now() || (userId !== null && row.userId !== userId)) throw new UserError("A verificação expirou. Tente novamente.");
  return row.challenge;
}

// ---------------------------------------------------------------------------
// Cadastro (usuário já logado) — "Ativar Face ID / digital neste aparelho"
// ---------------------------------------------------------------------------
export async function beginPasskeyRegistrationAction(): Promise<ActionResult<{ options: PublicKeyCredentialCreationOptionsJSON; challengeId: string }>> {
  return runAction("beginPasskeyRegistration", async () => {
    const user = await assertUser();
    const { rpID } = await rp();
    const existing = await db.select().from(passkeys).where(eq(passkeys.userId, user.id));
    const options = await generateRegistrationOptions({
      rpName: APP.name,
      rpID,
      userName: user.email,
      userDisplayName: user.participantName ?? user.name,
      userID: new TextEncoder().encode(user.id),
      attestationType: "none",
      excludeCredentials: existing.map((c) => ({ id: c.credentialId, transports: c.transports })),
      // Biometria do próprio aparelho (Face ID, digital, Windows Hello), e a credencial fica salva para login sem digitar e-mail.
      authenticatorSelection: { residentKey: "required", userVerification: "required", authenticatorAttachment: "platform" },
    });
    return { ok: true, data: { options, challengeId: await newChallenge(options.challenge, "register", user.id) } };
  });
}

export async function finishPasskeyRegistrationAction(challengeId: string, response: RegistrationResponseJSON): Promise<ActionResult> {
  return runAction("finishPasskeyRegistration", async () => {
    const user = await assertUser();
    const expectedChallenge = await consumeChallenge(challengeId, "register", user.id);
    const { rpID, origin } = await rp();
    const v = await verifyRegistrationResponse({ response, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true }).catch(() => null);
    if (!v?.verified || !v.registrationInfo) throw new UserError("Não foi possível ativar neste aparelho. Tente de novo.");
    const { credential } = v.registrationInfo;
    const dup = await db.select({ id: passkeys.id }).from(passkeys).where(eq(passkeys.credentialId, credential.id)).get();
    if (dup) throw new UserError("Este aparelho já está ativado.");
    const device = deviceLabel((await headers()).get("user-agent"));
    await db.insert(passkeys).values({ userId: user.id, credentialId: credential.id, publicKey: toBase64Url(credential.publicKey), counter: credential.counter, transports: credential.transports ?? [], deviceName: device });
    await audit(user, "passkey.add", "user", user.id, `Ativou o login por biometria (${device})`);
    revalidatePath("/mais");
    return { ok: true, message: "Pronto! Da próxima vez entre só com o rosto ou a digital." };
  });
}

export async function removePasskeyAction(id: string): Promise<ActionResult> {
  return runAction("removePasskey", async () => {
    const user = await assertUser();
    const row = await db.select().from(passkeys).where(and(eq(passkeys.id, id), eq(passkeys.userId, user.id))).get(); // só os próprios
    if (!row) throw new UserError("Acesso não encontrado.");
    await db.delete(passkeys).where(eq(passkeys.id, id));
    await audit(user, "passkey.remove", "user", user.id, `Removeu o login por biometria (${row.deviceName})`);
    revalidatePath("/mais");
    return { ok: true, message: "Acesso removido." };
  });
}

// ---------------------------------------------------------------------------
// Login (anônimo): "Entrar com Face ID / digital"
// ---------------------------------------------------------------------------
export async function beginPasskeyLoginAction(): Promise<ActionResult<{ options: PublicKeyCredentialRequestOptionsJSON; challengeId: string }>> {
  return runAction("beginPasskeyLogin", async () => {
    const { rpID } = await rp();
    // Sem allowCredentials: o aparelho mostra as passkeys deste site e a pessoa escolhe (não precisa digitar e-mail).
    const options = await generateAuthenticationOptions({ rpID, userVerification: "required" });
    return { ok: true, data: { options, challengeId: await newChallenge(options.challenge, "login", null) } };
  });
}

export async function finishPasskeyLoginAction(challengeId: string, response: AuthenticationResponseJSON): Promise<ActionResult> {
  return runAction("finishPasskeyLogin", async () => {
    const key = `passkey|${await clientIp()}`;
    if (await isLimited(key, 15)) throw new UserError("Muitas tentativas. Aguarde alguns minutos e tente novamente.");
    const fail = async (): Promise<never> => {
      await registerHit(key);
      throw new UserError("Não foi possível entrar com biometria. Use e-mail e senha.");
    };
    const expectedChallenge = await consumeChallenge(challengeId, "login", null);
    const cred = await db.select().from(passkeys).where(eq(passkeys.credentialId, response.id)).get();
    if (!cred) return fail();
    const { rpID, origin } = await rp();
    const v = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: { id: cred.credentialId, publicKey: fromBase64Url(cred.publicKey), counter: cred.counter, transports: cred.transports as never },
    }).catch(() => null);
    if (!v?.verified) return fail();
    const user = await db.select().from(users).where(eq(users.id, cred.userId)).get();
    if (!user || !user.active) return fail();
    await db.update(passkeys).set({ counter: v.authenticationInfo.newCounter, lastUsedAt: new Date() }).where(eq(passkeys.id, cred.id));
    await createSession(user.id);
    return { ok: true };
  });
}

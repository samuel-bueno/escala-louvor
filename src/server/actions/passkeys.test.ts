/**
 * Login por biometria no servidor: desafio de uso único, expiração, credencial desconhecida,
 * desafio de outra pessoa e remoção só do que é seu. (A cerimônia criptográfica completa é
 * exercitada com um autenticador virtual do Chromium; aqui ficam as regras do servidor.)
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

const ctx = await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  process.env.DATABASE_URL = `file:${join(mkdtempSync(join(tmpdir(), "escala-pk-")), "test.db")}`;
  return { token: "" };
});
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (n === "el_session" && ctx.token ? { value: ctx.token } : undefined), set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ host: "localhost:3000", "user-agent": "Mozilla/5.0 (iPhone)" }),
}));

import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { hashToken } from "../auth/tokens";
import { db } from "../db/client";
import * as s from "../db/schema";
import { beginPasskeyLoginAction, beginPasskeyRegistrationAction, finishPasskeyLoginAction, finishPasskeyRegistrationAction, removePasskeyAction } from "./passkeys";

const fakeAuth = (id: string) => ({ id, rawId: id, type: "public-key", clientExtensionResults: {}, response: { clientDataJSON: "x", authenticatorData: "x", signature: "x" } }) as never;
const fakeReg = () => ({ id: "x", rawId: "x", type: "public-key", clientExtensionResults: {}, response: { clientDataJSON: "x", attestationObject: "x" } }) as never;
let userA = "";
let userB = "";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  const [org] = await db.insert(s.organizations).values({ name: "A", slug: "a" }).returning();
  const mk = async (email: string, token: string) => {
    const [u] = await db.insert(s.users).values({ organizationId: org.id, email, name: email, passwordHash: "x" }).returning();
    await db.insert(s.sessions).values({ id: hashToken(token), userId: u.id, expiresAt: new Date(Date.now() + 3_600_000) });
    return u.id;
  };
  userA = await mk("a@t.test", "ta");
  userB = await mk("b@t.test", "tb");
});

describe("desafio", () => {
  it("login: começa, guarda o desafio e ele só vale uma vez", async () => {
    const begin = await beginPasskeyLoginAction();
    expect(begin.ok).toBe(true);
    const { challengeId, options } = (begin as { data: { challengeId: string; options: { challenge: string; rpId?: string; userVerification?: string } } }).data;
    expect(options.rpId).toBe("localhost");
    expect(options.userVerification).toBe("required");
    expect((await db.select().from(s.passkeyChallenges).where(eq(s.passkeyChallenges.id, challengeId))).length).toBe(1);
    const r1 = await finishPasskeyLoginAction(challengeId, fakeAuth("nao-existe"));
    expect(r1.ok).toBe(false); // credencial desconhecida
    expect((await db.select().from(s.passkeyChallenges).where(eq(s.passkeyChallenges.id, challengeId))).length).toBe(0); // consumido
    const r2 = await finishPasskeyLoginAction(challengeId, fakeAuth("nao-existe")); // replay
    expect(JSON.stringify(r2)).toContain("expirou");
  });

  it("desafio expirado é recusado", async () => {
    const [row] = await db.insert(s.passkeyChallenges).values({ challenge: "c", purpose: "login", expiresAt: new Date(Date.now() - 1000) }).returning();
    expect(JSON.stringify(await finishPasskeyLoginAction(row.id, fakeAuth("x")))).toContain("expirou");
  });

  it("desafio de cadastro não serve para login (e vice-versa)", async () => {
    ctx.token = "ta";
    const reg = await beginPasskeyRegistrationAction();
    expect(reg.ok).toBe(true);
    const { challengeId } = (reg as { data: { challengeId: string } }).data;
    expect(JSON.stringify(await finishPasskeyLoginAction(challengeId, fakeAuth("x")))).toContain("expirou");
  });
});

describe("cadastro", () => {
  it("exige estar logado", async () => {
    ctx.token = "";
    expect((await beginPasskeyRegistrationAction()).ok).toBe(false);
  });

  it("desafio de OUTRA pessoa é recusado", async () => {
    ctx.token = "ta";
    const { challengeId } = ((await beginPasskeyRegistrationAction()) as { data: { challengeId: string } }).data;
    ctx.token = "tb";
    expect(JSON.stringify(await finishPasskeyRegistrationAction(challengeId, fakeReg()))).toContain("expirou");
  });

  it("resposta forjada não cadastra nada", async () => {
    ctx.token = "ta";
    const { challengeId } = ((await beginPasskeyRegistrationAction()) as { data: { challengeId: string } }).data;
    expect((await finishPasskeyRegistrationAction(challengeId, fakeReg())).ok).toBe(false);
    expect((await db.select().from(s.passkeys)).length).toBe(0);
  });
});

describe("remoção", () => {
  it("só remove as próprias", async () => {
    const [pk] = await db.insert(s.passkeys).values({ userId: userA, credentialId: "cred-a", publicKey: "k", deviceName: "iPhone" }).returning();
    ctx.token = "tb";
    expect((await removePasskeyAction(pk.id)).ok).toBe(false);
    expect((await db.select().from(s.passkeys)).length).toBe(1);
    ctx.token = "ta";
    expect((await removePasskeyAction(pk.id)).ok).toBe(true);
    expect((await db.select().from(s.passkeys)).length).toBe(0);
  });
  it("apagar a conta apaga as credenciais (cascata)", async () => {
    await db.insert(s.passkeys).values({ userId: userB, credentialId: "cred-b", publicKey: "k" });
    await db.delete(s.sessions).where(eq(s.sessions.userId, userB));
    await db.delete(s.users).where(eq(s.users.id, userB));
    expect((await db.select().from(s.passkeys)).length).toBe(0);
  });
});

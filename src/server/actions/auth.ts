"use server";

import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { verifyPassword } from "../auth/password";
import { createSession, destroySession } from "../auth/session";
import { db } from "../db/client";
import { loginAttempts, users } from "../db/schema";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Informe um e-mail válido.")),
  password: z.string().min(1, "Informe a senha."),
});

const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 8;

/** Rate limit simples por e-mail + IP, persistido no banco. */
async function tooManyAttempts(key: string): Promise<boolean> {
  const row = await db.select().from(loginAttempts).where(eq(loginAttempts.key, key)).get();
  if (!row) return false;
  if (Date.now() - row.windowStart.getTime() > WINDOW_MS) {
    await db.delete(loginAttempts).where(eq(loginAttempts.key, key));
    return false;
  }
  return row.count >= MAX_ATTEMPTS;
}

async function registerFailure(key: string) {
  const row = await db.select().from(loginAttempts).where(eq(loginAttempts.key, key)).get();
  if (!row) await db.insert(loginAttempts).values({ key, count: 1, windowStart: new Date() });
  else await db.update(loginAttempts).set({ count: row.count + 1 }).where(eq(loginAttempts.key, key));
}

export type LoginState = { error?: string; email?: string } | undefined;

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  const email = String(formData.get("email") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0].message, email };

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const key = `${parsed.data.email}|${ip}`;
  if (await tooManyAttempts(key)) return { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente.", email };

  const user = await db.select().from(users).where(eq(users.email, parsed.data.email)).get();
  // Mesmo tempo de resposta com ou sem usuário (evita enumeração de e-mails).
  const ok = user ? await verifyPassword(parsed.data.password, user.passwordHash) : await verifyPassword(parsed.data.password, "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$" + "A".repeat(86));
  if (!user || !ok || !user.active) {
    await registerFailure(key);
    return { error: "E-mail ou senha incorretos.", email };
  }
  await db.delete(loginAttempts).where(eq(loginAttempts.key, key));
  await createSession(user.id);
  redirect("/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

/** Preferência de tema (claro / escuro / sistema) — cookie simples, sem dado pessoal. */
export async function setThemeAction(theme: "light" | "dark" | "system") {
  (await cookies()).set("theme", theme, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}

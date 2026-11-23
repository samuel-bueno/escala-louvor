import "server-only";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "../db/client";
import { loginAttempts } from "../db/schema";

const WINDOW_MS = 15 * 60_000;

export async function clientIp(): Promise<string> {
  return (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

/** Limite simples por chave (ex.: "reg|ip"), persistido no banco. */
export async function isLimited(key: string, max = 10): Promise<boolean> {
  const row = await db.select().from(loginAttempts).where(eq(loginAttempts.key, key)).get();
  if (!row) return false;
  if (Date.now() - row.windowStart.getTime() > WINDOW_MS) {
    await db.delete(loginAttempts).where(eq(loginAttempts.key, key));
    return false;
  }
  return row.count >= max;
}

export async function registerHit(key: string): Promise<void> {
  const row = await db.select().from(loginAttempts).where(eq(loginAttempts.key, key)).get();
  if (!row) await db.insert(loginAttempts).values({ key, count: 1, windowStart: new Date() });
  else await db.update(loginAttempts).set({ count: row.count + 1 }).where(eq(loginAttempts.key, key));
}

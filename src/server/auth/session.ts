import "server-only";
import { and, eq, gt, lt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "../db/client";
import { participants, sessions, users } from "../db/schema";
import { canEditSetlist, canPublishSchedule, isLeader } from "@/domain/permissions";
import { generateToken, hashToken } from "./tokens";

export const SESSION_COOKIE = "el_session";
const SESSION_DAYS = 30;

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member";
  leadsInstrumental: boolean;
  leadsVocal: boolean;
  organizationId: string;
  participantId: string | null;
  participantName: string | null;
}

export async function createSession(userId: string): Promise<void> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt });
  // Limpeza oportunista de sessões expiradas.
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
  jar.delete(SESSION_COOKIE);
}

/** Usuário da requisição atual (deduplicado por requisição com React.cache). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      leadsInstrumental: users.leadsInstrumental,
      leadsVocal: users.leadsVocal,
      organizationId: users.organizationId,
      participantId: users.participantId,
      participantName: participants.displayName,
      active: users.active,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .leftJoin(participants, eq(participants.id, users.participantId))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .get();
  if (!row || !row.active) return null;
  const { active: _active, ...user } = row;
  void _active;
  return user;
});

/** Para páginas: redireciona para o login se não houver sessão. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Para páginas administrativas. */
export async function requireAdminPage(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/?erro=permissao");
  return user;
}

/** Páginas de operação (escalas, repertório): administração ou qualquer liderança. */
export async function requireLeaderPage(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!isLeader(user)) redirect("/?erro=permissao");
  return user;
}

/** Repertório: administração ou liderança vocal. */
export async function requireSetlistPage(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!canEditSetlist(user)) redirect("/?erro=permissao");
  return user;
}

export class AuthError extends Error {}

/** Para server actions: lança erro (autorização real no servidor). */
export async function assertUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Sua sessão expirou. Entre novamente.");
  return user;
}

export async function assertAdmin(): Promise<CurrentUser> {
  const user = await assertUser();
  if (user.role !== "admin") throw new AuthError("Você não tem permissão para esta ação.");
  return user;
}

/** Montagem de escalas: administração ou qualquer liderança (a área é checada por posição). */
export async function assertLeader(): Promise<CurrentUser> {
  const user = await assertUser();
  if (!isLeader(user)) throw new AuthError("Você não tem permissão para esta ação.");
  return user;
}

export async function assertCanEditSetlist(): Promise<CurrentUser> {
  const user = await assertUser();
  if (!canEditSetlist(user)) throw new AuthError("O repertório é definido pela liderança dos vocais.");
  return user;
}

export async function assertCanPublish(): Promise<CurrentUser> {
  const user = await assertUser();
  if (!canPublishSchedule(user)) throw new AuthError("Você não tem permissão para publicar a escala.");
  return user;
}

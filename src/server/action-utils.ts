import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";
import { AuthError, type CurrentUser } from "./auth/session";
import { db } from "./db/client";
import { auditLog } from "./db/schema";

/** Resultado padrão das server actions — mensagens humanas, nunca "Error 500". */
export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string | undefined> };

export class UserError extends Error {}

export function fieldErrorsFrom(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/**
 * Envolve a lógica de uma action: converte erros conhecidos em mensagens
 * amigáveis e registra o erro técnico no servidor (sem dados sensíveis).
 */
export async function runAction<T>(name: string, fn: () => Promise<ActionResult<T>>, fallback = "Não foi possível concluir a ação. Verifique os dados e tente novamente."): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (err) {
    // redirect()/notFound() do Next precisam propagar
    if (err && typeof err === "object" && "digest" in err && String((err as { digest: unknown }).digest).startsWith("NEXT_")) throw err;
    if (err instanceof AuthError || err instanceof UserError) return { ok: false, error: err.message };
    if (err instanceof z.ZodError) return { ok: false, error: "Revise os campos destacados.", fieldErrors: fieldErrorsFrom(err) };
    console.error(`[action:${name}]`, err instanceof Error ? `${err.name}: ${err.message}` : "erro desconhecido");
    return { ok: false, error: fallback };
  }
}

/** Mensagem exibida como toast após um redirect. */
export async function flash(message: string) {
  (await cookies()).set("flash", encodeURIComponent(message), { path: "/", maxAge: 15, sameSite: "lax" });
}

export async function audit(user: CurrentUser, action: string, entity: string, entityId: string | null, summary: string) {
  await db.insert(auditLog).values({ organizationId: user.organizationId, userId: user.id, action, entity, entityId, summary });
}

/** Lê FormData como objeto simples (campos repetidos viram array via getAll). */
export function formObject(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  fd.forEach((v, k) => {
    if (typeof v === "string" && !k.startsWith("$ACTION")) out[k] = v;
  });
  return out;
}

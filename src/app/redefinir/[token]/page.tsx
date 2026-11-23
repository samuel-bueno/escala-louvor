import type { Metadata } from "next";
import { and, eq, gt, isNull } from "drizzle-orm";
import { LogoMark } from "@/components/layout/logo";
import { hashToken } from "@/server/auth/tokens";
import { db } from "@/server/db/client";
import { passwordResets, users } from "@/server/db/schema";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Nova senha", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const row = /^[A-Za-z0-9_-]{32,64}$/.test(token)
    ? await db
        .select({ name: users.name })
        .from(passwordResets)
        .innerJoin(users, eq(users.id, passwordResets.userId))
        .where(and(eq(passwordResets.tokenHash, hashToken(token)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, new Date()), eq(users.active, true)))
        .get()
    : undefined;

  return (
    <main className="safe-top mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-6 flex flex-col items-center text-center">
        <LogoMark size={52} />
        {row ? (
          <>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">Criar nova senha</h1>
            <p className="mt-1 text-[15px] text-muted">Olá, {row.name.split(" ")[0]}! Escolha uma senha nova.</p>
          </>
        ) : (
          <>
            <h1 className="mt-3 text-xl font-semibold">Link indisponível</h1>
            <p className="mt-1 text-muted">Este link expirou ou já foi usado. Peça um novo ao líder do louvor.</p>
          </>
        )}
      </div>
      {row && <ResetForm token={token} />}
    </main>
  );
}

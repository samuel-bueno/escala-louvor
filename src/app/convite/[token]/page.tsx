import type { Metadata } from "next";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { LogoMark } from "@/components/layout/logo";
import { APP } from "@/config/app";
import { hashToken } from "@/server/auth/tokens";
import { db } from "@/server/db/client";
import { functions, invites, organizations } from "@/server/db/schema";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Cadastro", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = /^[A-Za-z0-9_-]{32,64}$/.test(token)
    ? await db
        .select({ orgId: invites.organizationId, orgName: organizations.name })
        .from(invites)
        .innerJoin(organizations, eq(organizations.id, invites.organizationId))
        .where(and(eq(invites.tokenHash, hashToken(token)), isNull(invites.revokedAt), gt(invites.expiresAt, new Date())))
        .get()
    : undefined;

  if (!invite) {
    return (
      <main className="grid min-h-dvh place-items-center px-6 text-center">
        <div>
          <LogoMark size={48} />
          <h1 className="mt-4 text-xl font-semibold">Convite indisponível</h1>
          <p className="mt-1 text-muted">Este link expirou ou foi cancelado. Peça um novo ao líder do louvor.</p>
        </div>
      </main>
    );
  }
  const fns = await db
    .select({ id: functions.id, name: functions.name, kind: functions.kind })
    .from(functions)
    .where(and(eq(functions.organizationId, invite.orgId), eq(functions.active, true)))
    .orderBy(asc(functions.sortOrder));

  return (
    <main className="safe-top mx-auto max-w-lg px-4 py-8">
      <div className="mb-6 flex flex-col items-center text-center">
        <LogoMark size={52} />
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Cadastro no louvor</h1>
        <p className="mt-1 text-[15px] text-muted text-balance">
          {invite.orgName} · {APP.name}
        </p>
      </div>
      <RegisterForm token={token} functions={fns} />
    </main>
  );
}

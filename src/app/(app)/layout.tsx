import { cookies } from "next/headers";
import { BottomNav, Sidebar } from "@/components/layout/nav";
import { isLeader, roleLabel } from "@/domain/permissions";
import { requireUser } from "@/server/auth/session";
import { ensureSundaySeries } from "@/server/recurrence";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // Garante a série de cultos de domingo (idempotente e barata: só trabalha quando falta gerar).
  await ensureSundaySeries(user.organizationId);
  const jar = await cookies();
  return (
    <div className="flex min-h-dvh">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Pular para o conteúdo
      </a>
      <Sidebar role={user.role} leader={isLeader(user)} roleText={roleLabel(user)} userName={user.participantName ?? user.name} theme={jar.get("theme")?.value ?? "system"} />
      <main id="conteudo" className="safe-top min-w-0 flex-1 px-4 pt-6 pb-[calc(88px+env(safe-area-inset-bottom))] sm:px-6 md:pt-8 md:pb-16 lg:px-12 lg:pt-10">
        <div className="mx-auto w-full max-w-[1040px]">{children}</div>
      </main>
      <BottomNav role={user.role} leader={isLeader(user)} />
    </div>
  );
}

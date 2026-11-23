import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogoFull } from "@/components/layout/logo";
import { HeroBackdrop } from "@/components/ui/hero-backdrop";
import { APP } from "@/config/app";
import { getCurrentUser } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  const demo = process.env.DEMO_MODE === "true";
  return (
    <main className="safe-top flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <HeroBackdrop className="mb-6 rounded-2xl">
          <div className="flex flex-col items-center px-6 py-8 text-center">
            <LogoFull width={216} color="#fff" />
            <h1 className="mt-6 text-[18px] leading-tight font-semibold">{APP.name}</h1>
            <p className="mt-1 text-[14px] text-white/75 text-balance">{APP.description}</p>
          </div>
        </HeroBackdrop>
        <LoginForm />
        {demo && (
          <div className="mt-6 rounded-xl border border-dashed border-border-strong p-4 text-sm">
            <p className="font-semibold">Modo demonstração — dados fictícios</p>
            <p className="mt-1 text-muted">Senha de todos: demo1234</p>
            <ul className="mt-2 space-y-1 text-muted">
              <li>
                <span className="font-medium text-fg">lider@exemplo.test</span> — liderança (administrador)
              </li>
              <li>
                <span className="font-medium text-fg">joao@exemplo.test</span> — ministro
              </li>
              <li>
                <span className="font-medium text-fg">musicos@exemplo.test</span> — líder dos músicos
              </li>
              <li>
                <span className="font-medium text-fg">vocais@exemplo.test</span> — líder dos vocais
              </li>
              <li>
                <span className="font-medium text-fg">daniel@exemplo.test</span> — músico
              </li>
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}

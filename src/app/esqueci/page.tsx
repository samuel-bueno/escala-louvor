import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { LogoMark } from "@/components/layout/logo";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default function ForgotPage() {
  return (
    <main className="safe-top mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-6 flex flex-col items-center text-center">
        <LogoMark size={52} />
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Esqueci minha senha</h1>
      </div>
      <div className="rounded-3xl border border-border bg-surface p-5 shadow-[var(--shadow-pop)]">
        <ol className="list-decimal space-y-2 pl-5 text-[15px]">
          <li>Peça ao líder do louvor um <strong>link de redefinição de senha</strong>.</li>
          <li>Ele gera o link no seu perfil e envia para você pelo WhatsApp.</li>
          <li>Abra o link, escolha uma senha nova e pronto.</li>
        </ol>
        <p className="mt-3 text-sm text-muted">O link vale por 48 horas e só pode ser usado uma vez.</p>
        <ButtonLink href="/login" variant="secondary" className="mt-4 w-full">
          Voltar ao login
        </ButtonLink>
      </div>
    </main>
  );
}

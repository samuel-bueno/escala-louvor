import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Não encontrado" };

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <p className="text-5xl font-semibold text-accent">404</p>
        <h1 className="mt-2 text-xl font-semibold">Página não encontrada</h1>
        <p className="mt-1 text-muted">O endereço pode estar errado, ou o item foi removido.</p>
        <ButtonLink href="/" className="mt-5">
          Voltar ao início
        </ButtonLink>
      </div>
    </main>
  );
}

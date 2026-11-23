import type { ReactNode } from "react";
import { APP } from "@/config/app";
import { cn } from "@/lib/cn";

/**
 * Destaque com fundo escuro para a "próxima escala" do músico.
 * Com foto (APP.heroImage): foto em preto e branco sob um véu escuro, para o texto branco sempre ler bem.
 * Sem foto: fundo tinta com a pomba da ADNO como marca d'água.
 * Texto sempre claro, nos dois temas.
 */
export function HeroBackdrop({ children, className }: { children: ReactNode; className?: string }) {
  const dove = "url(/brand/adno-pomba.png) right 8% center / 62% auto no-repeat";
  return (
    <div className={cn("relative isolate overflow-hidden bg-[#1b1a18] text-white", className)}>
      {APP.heroImage ? (
        <>
          {/* Enquadra na parte de baixo à direita (onde ficam as mãos), mesmo em faixas baixas e largas; um pouco mais claro. */}
          <div aria-hidden className="absolute inset-0 -z-20 bg-cover" style={{ backgroundImage: `url(${APP.heroImage})`, backgroundPosition: "72% 86%", filter: "grayscale(1) brightness(1.35) contrast(1.05)" }} />
          <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-[#1b1a18]/90 via-[#1b1a18]/70 to-[#1b1a18]/35" />
        </>
      ) : (
        <>
          <div aria-hidden className="absolute inset-0 -z-20 bg-[radial-gradient(120%_140%_at_85%_20%,#3a342d_0%,#1b1a18_60%)]" />
          <span aria-hidden className="absolute inset-0 -z-10 bg-white opacity-[0.07]" style={{ mask: dove, WebkitMask: dove }} />
        </>
      )}
      {children}
    </div>
  );
}

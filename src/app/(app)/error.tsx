"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/primitives";

/** Erro inesperado: mensagem humana + tentar de novo (detalhe técnico só no console). */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error.digest ?? error.message);
  }, [error]);
  return (
    <div className="mx-auto max-w-md py-12">
      <Callout tone="danger" title="Não foi possível carregar esta tela">
        Verifique sua conexão e tente novamente. Se o problema continuar, avise a liderança.
        {error.digest && <span className="mt-1 block text-xs text-muted">Código: {error.digest}</span>}
      </Callout>
      <Button className="mt-4 w-full" onClick={reset}>
        Tentar novamente
      </Button>
    </div>
  );
}

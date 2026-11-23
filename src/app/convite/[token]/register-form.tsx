"use client";

import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CheckChip, Input } from "@/components/ui/field";
import { Callout, Card } from "@/components/ui/primitives";
import { useFormAction } from "@/lib/use-form-action";
import { FUNCTION_KIND_LABELS } from "@/lib/validation";
import type { ActionResult } from "@/server/action-utils";
import { registerAction } from "@/server/actions/invites";

type Fn = { id: string; name: string; kind: keyof typeof FUNCTION_KIND_LABELS };

export function RegisterForm({ token, functions }: { token: string; functions: Fn[] }) {
  const { state, formProps, pending, ready, fieldErrors: fe } = useFormAction<ActionResult>(registerAction.bind(null, token));
  const kinds = Object.keys(FUNCTION_KIND_LABELS) as (keyof typeof FUNCTION_KIND_LABELS)[];

  if (state?.ok)
    return (
      <Card className="p-6 text-center" role="status">
        <CheckCircle2 className="mx-auto h-12 w-12 text-success" aria-hidden />
        <h2 className="mt-3 text-lg font-semibold">Cadastro enviado!</h2>
        <p className="mt-1 text-muted">{state.message}</p>
      </Card>
    );

  return (
    <form {...formProps} className="flex flex-col gap-4">
      {state && !state.ok && (
        <Callout tone="danger" role="alert">
          {state.error}
        </Callout>
      )}
      <Card className="grid grid-cols-1 gap-4 p-4">
        <Input label="Nome completo" name="fullName" required autoComplete="name" error={fe.fullName} />
        <Input label="Como quer ser chamado(a)" name="displayName" optional maxLength={40} error={fe.displayName} hint="Aparece nas escalas. Padrão: seu primeiro nome." />
        <Input label="E-mail" name="email" type="email" inputMode="email" autoComplete="email" required error={fe.email} hint="É o seu login." />
        <Input label="Telefone" name="phone" type="tel" inputMode="tel" optional autoComplete="tel" error={fe.phone} hint="Visível só para a liderança." />
      </Card>
      <Card className="p-4">
        <h2 className="font-semibold">O que você toca ou canta?</h2>
        <p className="mb-3 text-sm text-muted">Marque tudo que você faz. A liderança pode ajustar depois.</p>
        {fe.functionIds && <p className="mb-2 text-sm font-medium text-danger">{fe.functionIds}</p>}
        <div className="flex flex-col gap-4">
          {kinds.map((k) => {
            const list = functions.filter((f) => f.kind === k);
            if (!list.length) return null;
            return (
              <fieldset key={k}>
                <legend className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{FUNCTION_KIND_LABELS[k]}</legend>
                <div className="flex flex-wrap gap-2">
                  {list.map((f) => (
                    <CheckChip key={f.id} name="functionIds" value={f.id} label={f.name} />
                  ))}
                </div>
              </fieldset>
            );
          })}
        </div>
      </Card>
      <Card className="grid grid-cols-1 gap-4 p-4">
        <Input label="Crie uma senha" name="password" type="password" autoComplete="new-password" required error={fe.password} hint="Mínimo 8 caracteres." />
        <Input label="Repita a senha" name="confirm" type="password" autoComplete="new-password" required error={fe.confirm} />
      </Card>
      <Button type="submit" size="lg" loading={pending} disabled={!ready}>
        Enviar cadastro
      </Button>
      <p className="text-center text-sm text-muted">Seu cadastro precisa ser aprovado pela liderança antes de você poder entrar.</p>
    </form>
  );
}

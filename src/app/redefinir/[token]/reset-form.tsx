"use client";

import { CheckCircle2 } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Callout, Card } from "@/components/ui/primitives";
import { useFormAction } from "@/lib/use-form-action";
import type { ActionResult } from "@/server/action-utils";
import { resetPasswordAction } from "@/server/actions/invites";

export function ResetForm({ token }: { token: string }) {
  const { state, formProps, pending, ready, fieldErrors: fe } = useFormAction<ActionResult>(resetPasswordAction.bind(null, token));

  if (state?.ok)
    return (
      <Card className="p-6 text-center" role="status">
        <CheckCircle2 className="mx-auto h-12 w-12 text-success" aria-hidden />
        <p className="mt-3 font-semibold">{state.message}</p>
        <ButtonLink href="/login" className="mt-4 w-full">
          Ir para o login
        </ButtonLink>
      </Card>
    );

  return (
    <form {...formProps} className="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-5 shadow-[var(--shadow-pop)]">
      {state && !state.ok && (
        <Callout tone="danger" role="alert">
          {state.error}
        </Callout>
      )}
      <Input label="Nova senha" name="password" type="password" autoComplete="new-password" required error={fe.password} hint="Mínimo 8 caracteres." />
      <Input label="Repita a senha" name="confirm" type="password" autoComplete="new-password" required error={fe.confirm} />
      <Button type="submit" size="lg" loading={pending} disabled={!ready}>
        Salvar nova senha
      </Button>
    </form>
  );
}

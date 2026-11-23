"use client";

import Link from "next/link";
import { Fingerprint } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Callout } from "@/components/ui/primitives";
import { loginAction, type LoginState } from "@/server/actions/auth";
import { signInWithPasskey, usePasskeySupport } from "@/features/auth/passkey-client";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, undefined);
  const supported = usePasskeySupport();
  const router = useRouter();
  const [bioError, setBioError] = useState<string | null>(null);
  const [bioPending, startBio] = useTransition();
  const bio = () =>
    startBio(async () => {
      setBioError(null);
      const res = await signInWithPasskey();
      if (res.ok) {
        router.replace("/");
        router.refresh();
      } else setBioError(res.error);
    });
  return (
    <form action={action} className="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-5 shadow-[var(--shadow-pop)]">
      {(state?.error || bioError) && (
        <Callout tone="danger" role="alert">
          {state?.error ?? bioError}
        </Callout>
      )}
      {/* autoComplete="username": é o que o chaveiro do iPhone/Chrome usam para oferecer "salvar senha" e preencher depois. */}
      <Input label="E-mail" name="email" type="email" autoComplete="username" inputMode="email" required defaultValue={state?.email} />
      <Input label="Senha" name="password" type="password" autoComplete="current-password" required />
      <Button type="submit" size="lg" loading={pending}>
        Entrar
      </Button>
      {supported && (
        <>
          <div className="flex items-center gap-3 text-[12px] text-muted" aria-hidden>
            <span className="h-px flex-1 bg-border" />
            ou
            <span className="h-px flex-1 bg-border" />
          </div>
          <Button type="button" variant="secondary" size="lg" icon={<Fingerprint className="h-5 w-5" aria-hidden />} loading={bioPending} onClick={bio}>
            Entrar com Face ID ou digital
          </Button>
        </>
      )}
      <Link href="/esqueci" className="link-action -mb-1 justify-center font-medium">
        Esqueci minha senha
      </Link>
    </form>
  );
}

"use client";

import { useActionState, startTransition, useSyncExternalStore, type FormEvent } from "react";

type Result = { ok: true; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string | undefined> };

const noop = () => () => {};

/** true somente após a hidratação no cliente. */
export function useHydrated() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

/**
 * Envia um formulário para uma server action SEM o reset automático do React 19
 * (que apagaria o que o usuário digitou quando há erro de validação).
 *
 * Segurança: `method="post"` garante que, se o formulário for enviado antes da
 * hidratação, os dados nunca vão para a URL (GET); e `ready` permite desabilitar
 * o botão até o JavaScript estar ativo.
 */
export function useFormAction<R extends Result>(action: (prev: R | undefined, fd: FormData) => Promise<R>) {
  const [state, dispatch, pending] = useActionState<R | undefined, FormData>(action, undefined);
  const ready = useHydrated();
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  };
  const fieldErrors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const formProps = { onSubmit, method: "post" as const, noValidate: true };
  return { state, onSubmit, pending, fieldErrors, ready, formProps };
}

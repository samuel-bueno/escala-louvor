"use client";

import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { useEffect, useState } from "react";
import { beginPasskeyLoginAction, beginPasskeyRegistrationAction, finishPasskeyLoginAction, finishPasskeyRegistrationAction } from "@/server/actions/passkeys";

type Result = { ok: true; message?: string } | { ok: false; error: string };

/** O aparelho tem Face ID / digital / Windows Hello pronto para uso? (decidido só no navegador) */
export function usePasskeySupport(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let alive = true;
    const api = typeof window !== "undefined" ? window.PublicKeyCredential : undefined;
    api?.isUserVerifyingPlatformAuthenticatorAvailable?.()
      .then((v) => alive && setOk(Boolean(v)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return ok;
}

const cancelled = (e: unknown) => e instanceof Error && (e.name === "NotAllowedError" || e.name === "AbortError");

/** Cadastra a biometria deste aparelho na conta logada. */
export async function enablePasskey(): Promise<Result> {
  const begin = await beginPasskeyRegistrationAction();
  if (!begin.ok || !begin.data) return { ok: false, error: begin.ok ? "Não foi possível iniciar." : begin.error };
  try {
    const response = await startRegistration({ optionsJSON: begin.data.options });
    return await finishPasskeyRegistrationAction(begin.data.challengeId, response);
  } catch (e) {
    if (cancelled(e)) return { ok: false, error: "Cancelado. Nada foi ativado." };
    if (e instanceof Error && e.name === "InvalidStateError") return { ok: false, error: "Este aparelho já está ativado." };
    return { ok: false, error: "Este aparelho não conseguiu ativar a biometria." };
  }
}

/** Entra com Face ID / digital. */
export async function signInWithPasskey(): Promise<Result> {
  const begin = await beginPasskeyLoginAction();
  if (!begin.ok || !begin.data) return { ok: false, error: begin.ok ? "Não foi possível iniciar." : begin.error };
  try {
    const response = await startAuthentication({ optionsJSON: begin.data.options });
    return await finishPasskeyLoginAction(begin.data.challengeId, response);
  } catch (e) {
    if (cancelled(e)) return { ok: false, error: "Cancelado." };
    return { ok: false, error: "Não foi possível entrar com biometria. Use e-mail e senha." };
  }
}

import "server-only";
import { headers } from "next/headers";
import { relyingPartyFrom, validAppUrl } from "./passkey-utils";

/**
 * Endereço público do app para montar links (convite, redefinição de senha, escala).
 * Vem do endereço em que a administração está usando o app agora, então o link nunca fica
 * errado por causa de domínio trocado ou de uma variável de ambiente mal preenchida.
 * `APP_URL` (se estiver válida) só serve de reserva quando não há cabeçalho de host.
 */
export async function appBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) return relyingPartyFrom(h.get("host"), h.get("x-forwarded-host"), h.get("x-forwarded-proto")).origin;
  return validAppUrl(process.env.APP_URL) ?? "";
}

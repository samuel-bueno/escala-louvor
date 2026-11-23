/** Peças puras do login por biometria (sem banco, sem Next): testáveis isoladamente. */

export interface RelyingParty {
  /** Domínio da credencial. Passkeys só funcionam no domínio em que foram criadas. */
  rpID: string;
  /** Origem completa que o navegador informa na cerimônia. */
  origin: string;
}

/** A partir dos cabeçalhos da requisição (atrás da Vercel vale x-forwarded-*). */
export function relyingPartyFrom(host: string | null, forwardedHost: string | null, forwardedProto: string | null): RelyingParty {
  const h = (forwardedHost ?? host ?? "localhost").split(",")[0].trim();
  const hostname = h.replace(/:\d+$/, "");
  const local = hostname === "localhost" || hostname === "127.0.0.1";
  const proto = (forwardedProto ?? (local ? "http" : "https")).split(",")[0].trim();
  return { rpID: hostname, origin: `${proto}://${h}` };
}

/** Rótulo curto do aparelho para a lista de acessos. */
export function deviceLabel(userAgent: string | null): string {
  const ua = userAgent ?? "";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "Mac";
  if (/Linux|X11/i.test(ua)) return "Linux";
  return "Este aparelho";
}

export const CHALLENGE_TTL_MS = 5 * 60_000;

export const toBase64Url = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64url");
export const fromBase64Url = (s: string): Uint8Array<ArrayBuffer> => new Uint8Array(Buffer.from(s, "base64url"));

/** Normaliza o valor de APP_URL. Devolve só a origem ("https://dominio") ou null se estiver malformado (ex.: dois endereços colados). */
export function validAppUrl(raw: string | undefined | null): string | null {
  const v = (raw ?? "").trim();
  if (!v || (v.match(/https?:/gi) ?? []).length !== 1 || /\s/.test(v)) return null;
  try {
    const u = new URL(v);
    // APP_URL é só o domínio: com caminho, consulta ou "http" dentro do host, é valor colado errado.
    if ((u.protocol !== "http:" && u.protocol !== "https:") || u.pathname !== "/" || u.search || u.hash || /https?/i.test(u.hostname)) return null;
    return u.origin;
  } catch {
    return null;
  }
}

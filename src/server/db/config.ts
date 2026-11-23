/**
 * Confere DATABASE_URL / DATABASE_AUTH_TOKEN antes de abrir o banco.
 * Erros de configuração viram uma mensagem clara em português (nunca imprimem o valor, só o formato).
 */
export interface DbConfig {
  url: string;
  authToken?: string;
}

const strip = (v: string) => {
  const t = v.trim();
  return (t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")) ? t.slice(1, -1).trim() : t;
};

export function checkDbConfig(rawUrl: string | undefined, rawToken: string | undefined, opts: { onVercel?: boolean } = {}): DbConfig {
  const url = strip(rawUrl ?? "") || "file:./data/escala.db";
  const token = strip(rawToken ?? "") || undefined;
  const fail = (msg: string): never => {
    throw new Error(`Configuração do banco: ${msg}`);
  };

  if (/\s/.test(url)) fail("DATABASE_URL tem espaço ou quebra de linha. Cole só o endereço, sem espaços.");
  if ((url.match(/(?:file|libsql|https?|wss?):/gi) ?? []).length > 1) fail("DATABASE_URL tem dois endereços colados. Deixe um só, ex.: libsql://nome-do-banco-sua-org.turso.io");
  const scheme = /^(file|libsql|https?|wss?):/i.exec(url)?.[1]?.toLowerCase();
  if (!scheme) fail("DATABASE_URL precisa começar com libsql:// (Turso) ou file: (desenvolvimento).");

  if (scheme === "file") {
    // Na Vercel o disco é só de leitura e some a cada execução: um arquivo local aparenta funcionar e perde os dados.
    if (opts.onVercel) fail("DATABASE_URL está vazia ou aponta para um arquivo local, e isso não funciona na Vercel. Use o endereço do Turso (libsql://…) e o DATABASE_AUTH_TOKEN, nas variáveis de ambiente do ambiente certo (Production e Preview).");
    return { url };
  }

  let host = "";
  try {
    host = new URL(url.replace(/^libsql:/i, "https:")).hostname;
  } catch {
    fail("DATABASE_URL não é um endereço válido. Exemplo: libsql://nome-do-banco-sua-org.turso.io");
  }
  if (!host || /https?/i.test(host)) fail("DATABASE_URL não é um endereço válido. Exemplo: libsql://nome-do-banco-sua-org.turso.io");
  if (!/[?&]authToken=/.test(url)) {
    if (!token) fail("falta o DATABASE_AUTH_TOKEN (o token do Turso). Gere com: turso db tokens create <nome-do-banco>");
    if (/\s/.test(token ?? "")) fail("DATABASE_AUTH_TOKEN tem espaço ou quebra de linha. Cole só o token, sem espaços.");
  }
  return { url, authToken: token };
}

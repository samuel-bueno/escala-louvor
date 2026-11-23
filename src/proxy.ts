import { NextResponse, type NextRequest } from "next/server";

/**
 * Content-Security-Policy com nonce por requisição (guia oficial do Next).
 *
 * - script-src: só 'self' + nonce (+ 'strict-dynamic' para os chunks que o Next carrega).
 *   Nada de 'unsafe-inline' em scripts. 'unsafe-eval' apenas em desenvolvimento (React).
 * - style-src 'unsafe-inline': o app usa atributos style="" (tamanho de avatar, barras de
 *   progresso). Estilo inline não executa código; scripts continuam estritos.
 * - Sem terceiros: fontes (next/font) e ícones são do próprio domínio; sem analytics.
 * - A página é sempre renderizada sob demanda (sessão por cookie), requisito do nonce.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Páginas e server actions; fora: estáticos do Next, imagens e arquivos com extensão (sw.js, ícones, manifest).
      source: "/((?!_next/static|_next/image|.*\\..*).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

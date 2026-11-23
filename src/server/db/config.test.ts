import { describe, expect, it } from "vitest";
import { checkDbConfig } from "./config";

const ok = (url: string | undefined, token?: string, onVercel = false) => checkDbConfig(url, token, { onVercel });
const err = (url: string | undefined, token?: string, onVercel = false) => {
  try {
    ok(url, token, onVercel);
    return "";
  } catch (e) {
    return (e as Error).message;
  }
};

describe("checkDbConfig", () => {
  it("desenvolvimento: sem variável usa o arquivo local", () => {
    expect(ok(undefined)).toEqual({ url: "file:./data/escala.db", authToken: undefined });
  });
  it("Turso correto, com ou sem aspas e espaços nas pontas", () => {
    expect(ok("libsql://banco-org.turso.io", "tok")).toEqual({ url: "libsql://banco-org.turso.io", authToken: "tok" });
    expect(ok('  "libsql://banco-org.turso.io"  ', ' "tok" ')).toEqual({ url: "libsql://banco-org.turso.io", authToken: "tok" });
  });
  it("aceita o token na própria URL", () => {
    expect(ok("libsql://banco-org.turso.io?authToken=abc").url).toContain("authToken=abc");
  });
  it("recusa dois endereços colados e espaços no meio", () => {
    expect(err("libsql://a.turso.iolibsql://b.turso.io", "t")).toMatch(/dois endereços colados/);
    expect(err("libsql://a.turso.io libsql://b", "t")).toMatch(/espaço/);
  });
  it("recusa texto sem protocolo e host inválido", () => {
    expect(err("banco-org.turso.io", "t")).toMatch(/começar com libsql/);
    expect(err("libsql://", "t")).toMatch(/válido/);
  });
  it("Turso sem token: erro que explica como gerar", () => {
    expect(err("libsql://banco-org.turso.io")).toMatch(/DATABASE_AUTH_TOKEN/);
    expect(err("libsql://banco-org.turso.io", "   ")).toMatch(/DATABASE_AUTH_TOKEN/);
  });
  it("token com quebra de linha é recusado", () => {
    expect(err("libsql://banco-org.turso.io", "abc\ndef")).toMatch(/espaço ou quebra/);
  });
  it("na Vercel, arquivo local (ou variável ausente) é recusado", () => {
    expect(err(undefined, undefined, true)).toMatch(/não funciona na Vercel/);
    expect(err("file:./x.db", undefined, true)).toMatch(/não funciona na Vercel/);
  });
  it("a mensagem nunca repete o valor da variável", () => {
    expect(err("libsql://SEGREDO.turso.iolibsql://x", "TOKEN-SECRETO")).not.toMatch(/SEGREDO|TOKEN-SECRETO/);
  });
});

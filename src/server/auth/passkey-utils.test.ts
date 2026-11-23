import { describe, expect, it } from "vitest";
import { deviceLabel, fromBase64Url, relyingPartyFrom, toBase64Url, validAppUrl } from "./passkey-utils";

describe("relyingPartyFrom", () => {
  it("usa o domínio de produção atrás da Vercel (x-forwarded-*)", () => {
    expect(relyingPartyFrom("internal:3000", "escala.exemplo.com.br", "https")).toEqual({ rpID: "escala.exemplo.com.br", origin: "https://escala.exemplo.com.br" });
  });
  it("em localhost usa http e tira a porta do rpID, mantendo-a na origem", () => {
    expect(relyingPartyFrom("localhost:3000", null, null)).toEqual({ rpID: "localhost", origin: "http://localhost:3000" });
  });
  it("assume https para qualquer outro domínio", () => {
    expect(relyingPartyFrom("meu-app.vercel.app", null, null)).toEqual({ rpID: "meu-app.vercel.app", origin: "https://meu-app.vercel.app" });
  });
  it("aceita lista no cabeçalho (primeiro valor)", () => {
    expect(relyingPartyFrom(null, "a.com, b.com", "https, http").rpID).toBe("a.com");
  });
});

describe("deviceLabel", () => {
  it("reconhece aparelhos", () => {
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe("iPhone");
    expect(deviceLabel("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe("Android");
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("Windows");
    expect(deviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("Mac");
    expect(deviceLabel(null)).toBe("Este aparelho");
  });
});

describe("base64url", () => {
  it("ida e volta sem perder bytes", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255, 63, 62]);
    expect([...fromBase64Url(toBase64Url(bytes))]).toEqual([...bytes]);
  });
});

describe("validAppUrl", () => {
  it("aceita um endereço normal e devolve só a origem", () => {
    expect(validAppUrl("https://adno-louvor.vercel.app/")).toBe("https://adno-louvor.vercel.app");
    expect(validAppUrl("http://localhost:3000")).toBe("http://localhost:3000");
  });
  it("rejeita dois endereços colados (o caso do link de convite quebrado)", () => {
    expect(validAppUrl("https://adno-louvor.vercel.apphttps//escalas-adno-minezota.vercel.app")).toBeNull();
    expect(validAppUrl("https://a.comhttps://b.com")).toBeNull();
  });
  it("rejeita vazio, sem protocolo e protocolos estranhos", () => {
    expect(validAppUrl("")).toBeNull();
    expect(validAppUrl(undefined)).toBeNull();
    expect(validAppUrl("adno-louvor.vercel.app")).toBeNull();
    expect(validAppUrl("javascript:alert(1)")).toBeNull();
  });
});

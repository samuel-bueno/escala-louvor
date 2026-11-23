import { describe, expect, it } from "vitest";
import { createRng } from "../random";
import { generateSetlist, generateSetlistsForPeriod, type SetlistSong } from "./generate";

const CEL = "c-celebracao";
const ADO = "c-adoracao";
const ENC = "c-encerramento";

function song(id: string, categoryId: string, extra: Partial<SetlistSong> = {}): SetlistSong {
  return { id, title: id, active: true, categoryId, plays: [], ...extra };
}

const base = (seed = 1) => ({ date: "2026-12-06", minIntervalDays: 30, rng: createRng(seed) });

describe("gerador de repertório", () => {
  it("TESTE 8 — música inativa não entra automaticamente", () => {
    const songs = [song("ativa1", CEL), song("inativa", CEL, { active: false }), song("ativa2", CEL)];
    for (let seed = 1; seed <= 30; seed++) {
      const r = generateSetlist(songs, { ...base(seed), total: 3 });
      expect(r.items.map((i) => i.songId)).not.toContain("inativa");
    }
  });

  it("TESTE 9 — intervalo mínimo é respeitado", () => {
    const songs = [
      song("recente", ADO, { plays: ["2026-11-29"] }),
      song("antiga", ADO, { plays: ["2026-08-01"] }),
      song("nova", ADO),
    ];
    for (let seed = 1; seed <= 30; seed++) {
      const r = generateSetlist(songs, { ...base(seed), total: 2, categories: [{ categoryId: ADO, count: 2 }] });
      expect(r.items.map((i) => i.songId).sort()).toEqual(["antiga", "nova"]);
    }
  });

  it("TESTE 10 — poucas músicas: resultado parcial + aviso", () => {
    const songs = [song("a", CEL), song("b", CEL), song("c", CEL), song("d", CEL, { plays: ["2026-12-01"] })];
    const r = generateSetlist(songs, { ...base(), total: 5 });
    expect(r.items).toHaveLength(3);
    expect(r.warnings.join(" ")).toContain("Foram encontradas apenas 3 de 5");
  });

  it("flexibilizar intervalo completa com músicas recentes, marcadas", () => {
    const songs = [song("a", CEL), song("rec", CEL, { plays: ["2026-12-01"] })];
    const r = generateSetlist(songs, { ...base(), total: 2, relaxInterval: true });
    expect(r.items).toHaveLength(2);
    expect(r.items.find((i) => i.songId === "rec")?.relaxed).toBe(true);
  });

  it("respeita quantidades por categoria e ordem do culto", () => {
    const songs = [song("c1", CEL), song("c2", CEL), song("c3", CEL), song("a1", ADO), song("a2", ADO), song("e1", ENC)];
    const r = generateSetlist(songs, {
      ...base(),
      total: 5,
      categories: [
        { categoryId: CEL, count: 2 },
        { categoryId: ADO, count: 2 },
        { categoryId: ENC, count: 1 },
      ],
    });
    expect(r.items.map((i) => i.categoryId)).toEqual([CEL, CEL, ADO, ADO, ENC]);
  });

  it("obrigatórias entram e bloqueadas nunca entram", () => {
    const songs = [song("obrig", ADO, { plays: ["2026-12-01"] }), song("bloq", ADO), song("x", ADO), song("y", ADO)];
    for (let seed = 1; seed <= 20; seed++) {
      const r = generateSetlist(songs, { ...base(seed), total: 3, requiredIds: ["obrig"], blockedIds: ["bloq"] });
      const ids = r.items.map((i) => i.songId);
      expect(ids).toContain("obrig");
      expect(ids).not.toContain("bloq");
    }
  });

  it("período: distribui músicas sem repetir dentro do intervalo", () => {
    const songs = Array.from({ length: 12 }, (_, i) => song(`s${i}`, CEL));
    const out = generateSetlistsForPeriod(["2027-01-03", "2027-01-10", "2027-01-17"], songs, { total: 4, minIntervalDays: 21, rng: createRng(3) });
    const all = out.flatMap((o) => o.result.items.map((i) => i.songId));
    expect(new Set(all).size).toBe(12);
  });
});

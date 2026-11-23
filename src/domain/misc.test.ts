import { describe, expect, it } from "vitest";
import { addDays, formatDate, isValidDate, todayIn, weekday, weekdayName } from "./dates";
import { describeRecurrence, occurrences } from "./recurrence";
import { parseSongImport } from "./song-import";

describe("datas civis", () => {
  it("domingo continua domingo (sem conversão UTC)", () => {
    expect(weekday("2026-11-15")).toBe(0);
    expect(weekdayName("2026-11-15")).toBe("Domingo");
    expect(formatDate("2026-11-15")).toBe("15/11/2026");
  });
  it("valida datas", () => {
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("2026-02-28")).toBe(true);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("hoje no fuso de São Paulo", () => {
    // 02:00 UTC de 16/11 ainda é 15/11 em São Paulo (UTC-3)
    expect(todayIn("America/Sao_Paulo", new Date("2026-11-16T02:00:00Z"))).toBe("2026-11-15");
  });
});

describe("recorrência", () => {
  it("todo domingo", () => {
    expect(occurrences({ weekday: 0, nthOfMonth: null }, "2026-11-01", "2026-11-30")).toEqual(["2026-11-01", "2026-11-08", "2026-11-15", "2026-11-22", "2026-11-29"]);
  });
  it("primeiro sábado do mês", () => {
    expect(occurrences({ weekday: 6, nthOfMonth: 1 }, "2026-11-01", "2027-01-31")).toEqual(["2026-11-07", "2026-12-05", "2027-01-02"]);
  });
  it("último domingo", () => {
    expect(occurrences({ weekday: 0, nthOfMonth: -1 }, "2026-11-01", "2026-11-30")).toEqual(["2026-11-29"]);
    expect(describeRecurrence({ weekday: 4, nthOfMonth: null })).toBe("Toda quinta-feira");
  });
});

describe("importação de músicas", () => {
  it("lê formatos, valida links e detecta duplicidades", () => {
    const rows = parseSongImport(
      ["Caminho de Luz | https://example.com/a", "Rei Eterno | Banda X | https://example.com/b", "caminho de luz | https://example.com/c", "Nova Canção | htps:/quebrado", "https://example.com/d", "Graça Sobre Graça"].join("\n"),
      ["Rei Eterno"],
    );
    expect(rows).toHaveLength(6);
    expect(rows[0]).toMatchObject({ title: "Caminho de Luz", url: "https://example.com/a", errors: [], duplicateOf: null });
    expect(rows[1]).toMatchObject({ artist: "Banda X", duplicateOf: "existing" });
    expect(rows[2].duplicateOf).toBe("batch");
    expect(rows[3].url).toBe("htps:/quebrado");
    expect(rows[3].artist).toBeNull();
    expect(rows[3].errors[0]).toMatch(/Link inválido/);
    expect(rows[4].errors).toContain("Informe o nome da música.");
    expect(rows[5]).toMatchObject({ title: "Graça Sobre Graça", url: null, errors: [] });
  });
});

/**
 * Recorrência dos cultos de domingo (série até 31/12/2027) com banco SQLite temporário:
 * idempotência, sem duplicar, exceções (editar/cancelar uma data), virada de ano e
 * isolamento entre igrejas.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  process.env.DATABASE_URL = `file:${join(mkdtempSync(join(tmpdir(), "escala-rec-")), "test.db")}`;
});
vi.mock("server-only", () => ({}));

import { and, eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { addDays, todayIn, weekday } from "@/domain/dates";
import { db } from "./db/client";
import * as s from "./db/schema";
import { ensureSundaySeries, SERIES_UNTIL } from "./recurrence";

let orgA = "";
let orgB = "";
const today = todayIn();

/** Domingos de hoje até a data final (inclusive), calculados de forma independente do código testado. */
function expectedSundays(from = today, to = SERIES_UNTIL) {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (weekday(d) === 0) out.push(d);
  return out;
}
const sundaysOf = async (org: string) =>
  (await db.select({ date: s.events.date, id: s.events.id, status: s.events.status, startTime: s.events.startTime }).from(s.events).where(and(eq(s.events.organizationId, org), eq(s.events.type, "culto"))).orderBy(s.events.date));
/** Força o "ensureSundaySeries" a trabalhar de novo (como num deploy que reinicia a marcação). */
const resetMarker = (org: string) => db.update(s.orgSettings).set({ sundaySeriesUntil: null }).where(eq(s.orgSettings.organizationId, org));

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  [{ id: orgA }, { id: orgB }] = await db.insert(s.organizations).values([{ name: "A", slug: "a" }, { name: "B", slug: "b" }]).returning({ id: s.organizations.id });
});

describe("série de domingos até 31/12/2027", () => {
  it("programa todos os domingos de hoje até 31/12/2027, só domingos", async () => {
    await ensureSundaySeries(orgA);
    const rows = await sundaysOf(orgA);
    expect(rows.map((r) => r.date)).toEqual(expectedSundays());
    expect(rows.every((r) => weekday(r.date) === 0)).toBe(true);
    expect(rows.at(-1)!.date).toBe("2027-12-26"); // último domingo de 2027
    expect(rows.some((r) => r.date > SERIES_UNTIL)).toBe(false);
  });

  it("virada de ano: 27/12/2026 e 03/01/2027 existem", async () => {
    const dates = (await sundaysOf(orgA)).map((r) => r.date);
    expect(dates).toContain("2026-12-27");
    expect(dates).toContain("2027-01-03");
  });

  it("é idempotente: rodar de novo (inclusive forçando) não duplica nada", async () => {
    const before = await sundaysOf(orgA);
    await ensureSundaySeries(orgA); // atalho: já está em dia
    await resetMarker(orgA);
    await ensureSundaySeries(orgA); // trabalha de novo
    await resetMarker(orgA);
    await ensureSundaySeries(orgA);
    const after = await sundaysOf(orgA);
    expect(after.length).toBe(before.length);
    expect(after.map((r) => r.id)).toEqual(before.map((r) => r.id));
    const dup = await db.all(sql`select date, count(*) c from events where organization_id = ${orgA} and recurrence_id is not null group by date having c > 1`);
    expect(dup).toEqual([]);
  });

  it("editar um domingo não altera os demais", async () => {
    const rows = await sundaysOf(orgA);
    const target = rows[3];
    await db.update(s.events).set({ startTime: "10:00", title: "Culto de Ceia" }).where(eq(s.events.id, target.id));
    await resetMarker(orgA);
    await ensureSundaySeries(orgA);
    const after = await sundaysOf(orgA);
    expect(after.find((r) => r.id === target.id)!.startTime).toBe("10:00"); // exceção preservada
    expect(after.filter((r) => r.id !== target.id).every((r) => r.startTime === "19:00")).toBe(true);
    expect(after.length).toBe(rows.length);
  });

  it("escala e repertório de uma data são preservados quando a série roda de novo", async () => {
    const [ev] = await sundaysOf(orgA);
    const [song] = await db.insert(s.songs).values({ organizationId: orgA, title: "Música" }).returning();
    await db.insert(s.setlistItems).values({ eventId: ev.id, songId: song.id, position: 0, key: "G" });
    const slotsBefore = await db.select().from(s.eventSlots).where(eq(s.eventSlots.eventId, ev.id));
    await resetMarker(orgA);
    await ensureSundaySeries(orgA);
    expect((await db.select().from(s.setlistItems).where(eq(s.setlistItems.eventId, ev.id))).length).toBe(1);
    expect((await db.select().from(s.eventSlots).where(eq(s.eventSlots.eventId, ev.id))).length).toBe(slotsBefore.length);
  });

  it("cancelar um domingo não o recria em silêncio", async () => {
    const rows = await sundaysOf(orgA);
    const target = rows[5];
    await db.update(s.events).set({ status: "cancelled" }).where(eq(s.events.id, target.id));
    await resetMarker(orgA);
    await ensureSundaySeries(orgA);
    const after = await sundaysOf(orgA);
    expect(after.filter((r) => r.date === target.date).length).toBe(1);
    expect(after.find((r) => r.date === target.date)!.status).toBe("cancelled");
    expect(after.length).toBe(rows.length);
  });
});

describe("não duplica o que já existe", () => {
  it("domingo já cadastrado à mão continua único e a série pula essa data", async () => {
    const manual = expectedSundays()[2];
    await db.insert(s.events).values({ organizationId: orgB, title: "Culto cadastrado à mão", type: "culto", date: manual, startTime: "09:00" });
    await ensureSundaySeries(orgB);
    const rows = await sundaysOf(orgB);
    expect(rows.filter((r) => r.date === manual).length).toBe(1);
    expect(rows.find((r) => r.date === manual)!.startTime).toBe("09:00"); // o cadastro manual vence
    expect(rows.map((r) => r.date)).toEqual(expectedSundays());
  });

  it("cada igreja tem a sua própria série, sem misturar", async () => {
    const a = await sundaysOf(orgA);
    const b = await sundaysOf(orgB);
    expect(new Set(a.map((r) => r.id)).size + new Set(b.map((r) => r.id)).size).toBe(a.length + b.length);
    const rules = await db.select().from(s.recurrenceRules);
    expect(rules.filter((r) => r.weekday === 0 && r.type === "culto").length).toBe(2); // uma regra por igreja
  });

  it("evento extra em outro dia é independente da série", async () => {
    await db.insert(s.events).values({ organizationId: orgA, title: "Vigília", type: "culto_especial", date: addDays(expectedSundays()[0], 5), startTime: "22:00" });
    const before = (await sundaysOf(orgA)).length;
    await resetMarker(orgA);
    await ensureSundaySeries(orgA);
    expect((await sundaysOf(orgA)).length).toBe(before);
  });
});

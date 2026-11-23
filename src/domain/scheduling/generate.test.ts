import { describe, expect, it } from "vitest";
import { createRng } from "../random";
import { computeAlerts, hasBlockingErrors } from "./alerts";
import { canCommit, planApply } from "./apply";
import { generateSchedule } from "./generate";
import { DEFAULT_RULES, type Assignment, type SchedEvent, type SchedParticipant } from "./types";

const MIN = "f-ministro";
const GUIT = "f-guitarra";
const BAT = "f-bateria";
const VOC = "f-vocal";
const names = { [MIN]: "Ministro", [GUIT]: "Guitarra", [BAT]: "Bateria", [VOC]: "Vocal" };

function person(id: string, functionIds: string[], extra: Partial<SchedParticipant> = {}): SchedParticipant {
  return { id, name: id, active: true, functionIds, monthlyLimit: null, unavailable: [], usualDays: [], ...extra };
}

function event(id: string, date: string, fns: string[], extra: Partial<SchedEvent> = {}): SchedEvent {
  return {
    id,
    title: `Culto ${id}`,
    date,
    startTime: "19:00",
    endTime: "21:00",
    slots: fns.map((f, i) => ({ id: `${id}-s${i}`, functionId: f, participantId: null, locked: false, sortOrder: i })),
    ...extra,
  };
}

const opts = (seed = 1, extra = {}) => ({ mode: "fill-empty" as const, rng: createRng(seed), functionNames: names, ...extra });
const assigned = (r: ReturnType<typeof generateSchedule>, slotId: string) => r.proposals.find((p) => p.slotId === slotId)?.participantId;

describe("geração automática de escalas", () => {
  it("TESTE 1 — participante indisponível não é selecionado", () => {
    const people = [person("ana", [MIN], { unavailable: [{ start: "2026-12-06", end: "2026-12-06" }] }), person("joao", [MIN])];
    for (let seed = 1; seed <= 30; seed++) {
      const r = generateSchedule([event("e1", "2026-12-06", [MIN])], people, [], DEFAULT_RULES, opts(seed));
      expect(assigned(r, "e1-s0")).toBe("joao");
    }
    const r = generateSchedule([event("e1", "2026-12-06", [MIN])], people, [], DEFAULT_RULES, opts());
    expect(r.proposals[0].rejected.find((x) => x.participantId === "ana")?.reason).toMatch(/indisponível/);
  });

  it("TESTE 2 — participante com conflito de horário não é escalado", () => {
    const people = [person("ana", [GUIT]), person("bia", [GUIT])];
    const history: Assignment[] = [
      { eventId: "outro", eventTitle: "Conferência", participantId: "ana", functionId: GUIT, date: "2026-12-06", startTime: "18:00", endTime: "20:00" },
    ];
    for (let seed = 1; seed <= 30; seed++) {
      const r = generateSchedule([event("e1", "2026-12-06", [GUIT])], people, history, DEFAULT_RULES, opts(seed));
      expect(assigned(r, "e1-s0")).toBe("bia");
    }
  });

  it("TESTE 3 — quem não toca bateria não vira baterista", () => {
    const people = [person("ana", [GUIT, VOC]), person("caio", [MIN])];
    const r = generateSchedule([event("e1", "2026-12-06", [BAT])], people, [], DEFAULT_RULES, opts());
    expect(assigned(r, "e1-s0")).toBeNull();
  });

  it("TESTE 4 — pessoa fixada permanece na posição (inclusive ao regenerar tudo)", () => {
    const people = [person("ana", [MIN]), person("joao", [MIN]), person("rafa", [MIN])];
    const ev = event("e1", "2026-12-06", [MIN]);
    ev.slots[0] = { ...ev.slots[0], participantId: "ana", locked: true };
    for (let seed = 1; seed <= 20; seed++) {
      const r = generateSchedule([ev], people, [], DEFAULT_RULES, opts(seed, { mode: "replace-unlocked" }));
      expect(assigned(r, "e1-s0")).toBe("ana");
      expect(r.proposals[0].source).toBe("fixed");
    }
  });

  it("TESTE 5 — limite mensal obrigatório é respeitado", () => {
    const people = [person("ana", [MIN], { monthlyLimit: 1 }), person("joao", [MIN], { monthlyLimit: 1 })];
    const evs = ["2026-12-06", "2026-12-13", "2026-12-20"].map((d, i) => event(`e${i}`, d, [MIN]));
    const r = generateSchedule(evs, people, [], { ...DEFAULT_RULES, limitMode: "hard" }, opts());
    const filled = r.proposals.filter((p) => p.participantId);
    expect(filled).toHaveLength(2);
    expect(r.counts.ana).toBe(1);
    expect(r.counts.joao).toBe(1);
    expect(r.warnings.join(" ")).toMatch(/nenhum participante elegível/);
  });

  it("TESTE 5b — limite como preferência permite exceder quando necessário", () => {
    const people = [person("ana", [MIN], { monthlyLimit: 1 })];
    const evs = ["2026-12-06", "2026-12-13"].map((d, i) => event(`e${i}`, d, [MIN]));
    const r = generateSchedule(evs, people, [], { ...DEFAULT_RULES, limitMode: "soft" }, opts());
    expect(r.proposals.every((p) => p.participantId === "ana")).toBe(true);
    expect(r.proposals[1].reason).toMatch(/acima do limite/);
  });

  it("TESTE 6 — distribuição equilibrada (sem concentração) em um período longo", () => {
    const people = ["ana", "joao", "rafa", "lucas", "dani"].map((id) => person(id, [MIN], { monthlyLimit: 10 }));
    const dates: string[] = [];
    for (let d = new Date(Date.UTC(2027, 0, 3)); dates.length < 20; d.setUTCDate(d.getUTCDate() + 7)) dates.push(d.toISOString().slice(0, 10));
    const evs = dates.map((d, i) => event(`e${i}`, d, [MIN]));
    for (let seed = 1; seed <= 10; seed++) {
      const r = generateSchedule(evs, people, [], DEFAULT_RULES, opts(seed));
      const counts = Object.values(r.counts);
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
      // ninguém em domingos consecutivos
      const seq = r.proposals.map((p) => p.participantId);
      for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
    }
  });

  it("TESTE 6b — primeiras datas não concentram as mesmas pessoas", () => {
    const people = ["ana", "joao", "rafa", "lucas"].map((id) => person(id, [MIN], { monthlyLimit: 10 }));
    const evs = ["2027-01-03", "2027-01-10", "2027-01-17", "2027-01-24"].map((d, i) => event(`e${i}`, d, [MIN]));
    const r = generateSchedule(evs, people, [], DEFAULT_RULES, opts(7));
    expect(new Set(r.proposals.map((p) => p.participantId)).size).toBe(4);
  });

  it("TESTE 7 — sem candidato a vaga fica vazia (não inventa ninguém)", () => {
    const people = [person("ana", [GUIT])];
    const r = generateSchedule([event("e1", "2026-12-06", [GUIT, BAT])], people, [], DEFAULT_RULES, opts());
    expect(assigned(r, "e1-s1")).toBeNull();
    expect(r.proposals.find((p) => p.slotId === "e1-s1")?.source).toBe("empty");
    expect(r.warnings[0]).toContain("Bateria: nenhum participante elegível encontrado");
  });

  it("TESTE 12 — multi-instrumentista só é elegível para instrumentos cadastrados", () => {
    const maria = person("maria", [GUIT, VOC]);
    const r = generateSchedule([event("e1", "2026-12-06", [BAT, GUIT])], [maria], [], DEFAULT_RULES, opts());
    expect(assigned(r, "e1-s0")).toBeNull();
    expect(assigned(r, "e1-s1")).toBe("maria");
  });

  it("escassez: único baterista não é gasto na guitarra", () => {
    const people = [person("multi", [GUIT, BAT]), person("guit", [GUIT])];
    for (let seed = 1; seed <= 20; seed++) {
      const r = generateSchedule([event("e1", "2026-12-06", [GUIT, BAT])], people, [], DEFAULT_RULES, opts(seed));
      expect(assigned(r, "e1-s1")).toBe("multi");
      expect(assigned(r, "e1-s0")).toBe("guit");
    }
  });

  it("mesma pessoa não ocupa duas posições no mesmo compromisso automaticamente", () => {
    const r = generateSchedule([event("e1", "2026-12-06", [GUIT, VOC])], [person("ana", [GUIT, VOC])], [], DEFAULT_RULES, opts());
    expect(r.proposals.filter((p) => p.participantId === "ana")).toHaveLength(1);
  });

  it("participante inativo não entra em seleções automáticas", () => {
    const r = generateSchedule([event("e1", "2026-12-06", [MIN])], [person("ana", [MIN], { active: false })], [], DEFAULT_RULES, opts());
    expect(assigned(r, "e1-s0")).toBeNull();
  });

  it("seed torna a geração reproduzível", () => {
    const people = ["a", "b", "c", "d"].map((id) => person(id, [MIN]));
    const evs = ["2027-01-03", "2027-01-10"].map((d, i) => event(`e${i}`, d, [MIN]));
    const a = generateSchedule(evs, people, [], DEFAULT_RULES, opts(42));
    const b = generateSchedule(evs, people, [], DEFAULT_RULES, opts(42));
    expect(a.proposals.map((p) => p.participantId)).toEqual(b.proposals.map((p) => p.participantId));
  });

  it("explica a escolha em linguagem humana", () => {
    const r = generateSchedule([event("e1", "2026-12-06", [MIN])], [person("João", [MIN])], [], DEFAULT_RULES, opts());
    expect(r.proposals[0].reason).toMatch(/João: disponível/);
  });
});

describe("TESTE 11 — aplicar prévia não sobrescreve sem confirmação", () => {
  const current = [
    { id: "s1", participantId: null, locked: false },
    { id: "s2", participantId: "ana", locked: false },
    { id: "s3", participantId: "joao", locked: true },
  ];

  it("preenche vazias, mas exige confirmação para substituir alguém", () => {
    const plan = planApply(
      current,
      [
        { slotId: "s1", previousParticipantId: null, participantId: "bia" },
        { slotId: "s2", previousParticipantId: "ana", participantId: "caio" },
      ],
      { confirmReplace: false },
    );
    expect(plan.needsConfirmation).toEqual(["s2"]);
    expect(canCommit(plan)).toBe(false);
  });

  it("com confirmação explícita, substitui", () => {
    const plan = planApply(current, [{ slotId: "s2", previousParticipantId: "ana", participantId: "caio" }], { confirmReplace: true });
    expect(plan.updates).toEqual([{ slotId: "s2", participantId: "caio" }]);
    expect(canCommit(plan)).toBe(true);
  });

  it("recusa se a posição mudou depois da prévia (stale)", () => {
    const plan = planApply(current, [{ slotId: "s1", previousParticipantId: "alguem", participantId: "bia" }], { confirmReplace: true });
    expect(plan.stale).toEqual(["s1"]);
    expect(canCommit(plan)).toBe(false);
  });

  it("nunca altera posição fixada", () => {
    const plan = planApply(current, [{ slotId: "s3", previousParticipantId: "joao", participantId: "bia" }], { confirmReplace: true });
    expect(plan.updates).toEqual([]);
    expect(plan.lockedSkipped).toEqual(["s3"]);
  });
});

describe("alertas da escala", () => {
  const ev = { id: "e1", title: "Culto", date: "2026-12-06", startTime: "19:00", endTime: "21:00" };
  it("classifica instrumento incompatível e conflito como erro bloqueante", () => {
    const people = [person("ana", [GUIT]), person("bia", [BAT])];
    const others: Assignment[] = [{ eventId: "x", eventTitle: "Ensaio", participantId: "bia", functionId: BAT, date: "2026-12-06", startTime: "20:00", endTime: null }];
    const alerts = computeAlerts(ev, [
      { id: "s1", functionId: BAT, participantId: "ana" },
      { id: "s2", functionId: BAT, participantId: "bia" },
    ], people, others, DEFAULT_RULES, names);
    expect(alerts.find((a) => a.code === "incompatible")?.severity).toBe("error");
    expect(alerts.find((a) => a.code === "time-conflict")?.severity).toBe("error");
    expect(hasBlockingErrors(alerts)).toBe(true);
  });

  it("indisponibilidade e vaga vazia são avisos (podem ser ignorados)", () => {
    const people = [person("ana", [GUIT], { unavailable: [{ start: "2026-12-01", end: "2026-12-10" }] })];
    const alerts = computeAlerts(ev, [
      { id: "s1", functionId: GUIT, participantId: "ana" },
      { id: "s2", functionId: BAT, participantId: null },
    ], people, [], DEFAULT_RULES, names);
    expect(alerts.map((a) => [a.code, a.severity])).toEqual([
      ["unavailable", "warning"],
      ["required-empty", "warning"],
    ]);
    expect(hasBlockingErrors(alerts)).toBe(false);
  });
});

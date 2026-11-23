import { describe, expect, it } from "vitest";
import { areaOfKind, areasEditable, canEditArea, canEditSetlist, canManagePeople, canManageSettings, forbiddenAreas, isLeader, roleLabel, type Actor } from "./permissions";

const admin: Actor = { role: "admin", leadsInstrumental: false, leadsVocal: false };
const musicos: Actor = { role: "member", leadsInstrumental: true, leadsVocal: false };
const vocais: Actor = { role: "member", leadsInstrumental: false, leadsVocal: true };
const ambos: Actor = { role: "member", leadsInstrumental: true, leadsVocal: true };
const membro: Actor = { role: "member", leadsInstrumental: false, leadsVocal: false };

describe("área da posição vem de functions.kind (nunca do nome)", () => {
  it("classifica", () => {
    expect(areaOfKind("minister")).toBe("vocal");
    expect(areaOfKind("vocal")).toBe("vocal");
    expect(areaOfKind("instrument")).toBe("instrumental");
    expect(areaOfKind("tech")).toBe("other");
  });
});

describe("matriz de permissões", () => {
  it("administrador: tudo", () => {
    expect(areasEditable(admin)).toEqual(["instrumental", "vocal", "other"]);
    expect(canEditSetlist(admin) && canManagePeople(admin) && canManageSettings(admin)).toBe(true);
  });
  it("líder dos músicos: só instrumental; não edita repertório", () => {
    expect(canEditArea(musicos, "instrumental")).toBe(true);
    expect(canEditArea(musicos, "vocal")).toBe(false);
    expect(canEditArea(musicos, "other")).toBe(false);
    expect(canEditSetlist(musicos)).toBe(false);
    expect(canManagePeople(musicos) || canManageSettings(musicos)).toBe(false);
  });
  it("líder dos vocais: vocais + repertório; não edita instrumental", () => {
    expect(canEditArea(vocais, "vocal")).toBe(true);
    expect(canEditArea(vocais, "instrumental")).toBe(false);
    expect(canEditSetlist(vocais)).toBe(true);
  });
  it("lideranças acumulam", () => {
    expect(areasEditable(ambos)).toEqual(["instrumental", "vocal"]);
    expect(roleLabel(ambos)).toBe("Líder dos músicos e vocais");
  });
  it("membro: nada", () => {
    expect(isLeader(membro)).toBe(false);
    expect(areasEditable(membro)).toEqual([]);
    expect(canEditSetlist(membro)).toBe(false);
    expect(roleLabel(membro)).toBe("Membro");
  });
});

describe("forbiddenAreas", () => {
  const same = { area: "vocal" as const, sig: "a" };
  it("ignora o que não mudou", () => {
    expect(forbiddenAreas(musicos, [{ before: same, after: same }])).toEqual([]);
  });
  it("bloqueia alteração, remoção e adição em área alheia", () => {
    expect(forbiddenAreas(musicos, [{ before: same, after: { ...same, sig: "b" } }])).toEqual(["vocal"]);
    expect(forbiddenAreas(musicos, [{ before: same, after: null }])).toEqual(["vocal"]);
    expect(forbiddenAreas(vocais, [{ before: null, after: { area: "instrumental", sig: "x" } }])).toEqual(["instrumental"]);
  });
  it("mover posição de área para outra exige as duas", () => {
    expect(forbiddenAreas(musicos, [{ before: { area: "instrumental", sig: "a" }, after: { area: "vocal", sig: "a" } }])).toEqual(["vocal"]);
  });
});

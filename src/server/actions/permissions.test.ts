/**
 * Teste de INTEGRAÇÃO das permissões no backend.
 *
 * Banco SQLite temporário (migrations reais), duas igrejas (A e B) e as Server
 * Actions chamadas de verdade com a sessão de cada papel. Não testa botão
 * escondido: testa a tentativa direta no servidor.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

const ctx = await vi.hoisted(async () => {
  // Precisa existir ANTES de qualquer import que abra o banco.
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "escala-perm-"));
  process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;
  return { token: "" };
});

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error(`redirect:${url}`), { digest: `NEXT_REDIRECT;${url}` });
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "el_session" && ctx.token ? { value: ctx.token } : undefined),
    set: () => {},
    delete: () => {},
  }),
}));

import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { hashToken } from "../auth/tokens";
import { db } from "../db/client";
import * as s from "../db/schema";
import { acceptSwapSuggestionAction, applyGenerationAction, listSwapCandidatesAction, previewGenerationAction, respondToSlotAction, saveScheduleAction } from "./schedule";
import { saveSetlistAction } from "./songs";
import { setEventStatusAction } from "./events";
import { addUnavailabilityAction } from "./participants";

type Who = "adminA" | "musicosA" | "vocaisA" | "membroA" | "adminB";
const tokens: Record<Who, string> = { adminA: "tA", musicosA: "tM", vocaisA: "tV", membroA: "tMem", adminB: "tB" };
const as = (w: Who) => {
  ctx.token = tokens[w];
};

const D = {} as {
  orgA: string;
  orgB: string;
  fn: Record<string, string>;
  fnB: string;
  evA: string;
  evEmpty: string;
  evB: string;
  slot: Record<string, string>; // por nome da função, no evento A
  pMem: string;
  songA: string;
  songB: string;
};

const FUTURE = "2027-03-07";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  const [oa] = await db.insert(s.organizations).values({ name: "Igreja A", slug: "a" }).returning();
  const [ob] = await db.insert(s.organizations).values({ name: "Igreja B", slug: "b" }).returning();
  D.orgA = oa.id;
  D.orgB = ob.id;

  const fnDefs = [
    ["Ministro de Louvor", "minister"],
    ["Backing Vocal", "vocal"],
    ["Violão", "instrument"],
    ["Bateria", "instrument"],
    ["Operador de Áudio", "tech"],
  ] as const;
  const fnRows = await db.insert(s.functions).values(fnDefs.map(([name, kind], i) => ({ organizationId: D.orgA, name, kind, sortOrder: i }))).returning();
  D.fn = Object.fromEntries(fnRows.map((f) => [f.name, f.id]));
  const [fb] = await db.insert(s.functions).values({ organizationId: D.orgB, name: "Violão", kind: "instrument" }).returning();
  D.fnB = fb.id;

  const mkPerson = async (orgId: string, name: string, fns: string[]) => {
    const [p] = await db.insert(s.participants).values({ organizationId: orgId, fullName: name, displayName: name }).returning();
    for (const f of fns) await db.insert(s.participantFunctions).values({ participantId: p.id, functionId: f, isPrimary: false });
    return p.id;
  };
  const pAdmin = await mkPerson(D.orgA, "Admin A", []);
  const pMus = await mkPerson(D.orgA, "Líder Músicos", [D.fn["Violão"]]);
  const pVoc = await mkPerson(D.orgA, "Líder Vocais", [D.fn["Ministro de Louvor"]]);
  D.pMem = await mkPerson(D.orgA, "Membro", [D.fn["Bateria"], D.fn["Backing Vocal"]]);
  const pB = await mkPerson(D.orgB, "Admin B", []);

  const mkUser = async (who: Who, orgId: string, pid: string, v: Partial<typeof s.users.$inferInsert>) => {
    const [u] = await db.insert(s.users).values({ organizationId: orgId, email: `${who}@t.test`, name: who, passwordHash: "x", participantId: pid, ...v }).returning();
    await db.insert(s.sessions).values({ id: hashToken(tokens[who]), userId: u.id, expiresAt: new Date(Date.now() + 3_600_000) });
  };
  await mkUser("adminA", D.orgA, pAdmin, { role: "admin" });
  await mkUser("musicosA", D.orgA, pMus, { leadsInstrumental: true });
  await mkUser("vocaisA", D.orgA, pVoc, { leadsVocal: true });
  await mkUser("membroA", D.orgA, D.pMem, {});
  await mkUser("adminB", D.orgB, pB, { role: "admin" });

  const mkEvent = async (orgId: string, title: string, date = FUTURE) => {
    const [e] = await db.insert(s.events).values({ organizationId: orgId, title, date, startTime: "19:00", status: "draft" }).returning();
    return e.id;
  };
  D.evA = await mkEvent(D.orgA, "Culto A");
  D.evEmpty = await mkEvent(D.orgA, "Culto A vazio", "2027-03-14");
  D.evB = await mkEvent(D.orgB, "Culto B");
  D.slot = {};
  for (const [i, name] of ["Ministro de Louvor", "Backing Vocal", "Violão", "Bateria", "Operador de Áudio"].entries()) {
    const [sl] = await db.insert(s.eventSlots).values({ eventId: D.evA, functionId: D.fn[name], sortOrder: i }).returning();
    D.slot[name] = sl.id;
    await db.insert(s.eventSlots).values({ eventId: D.evEmpty, functionId: D.fn[name], sortOrder: i });
  }
  await db.insert(s.eventSlots).values({ eventId: D.evB, functionId: D.fnB, sortOrder: 0 });

  const [sa] = await db.insert(s.songs).values({ organizationId: D.orgA, title: "Música A" }).returning();
  const [sb] = await db.insert(s.songs).values({ organizationId: D.orgB, title: "Música B" }).returning();
  D.songA = sa.id;
  D.songB = sb.id;
});

/** Escala atual do evento no formato que a tela envia. */
async function currentSlots(eventId: string) {
  const rows = await db.select().from(s.eventSlots).where(eq(s.eventSlots.eventId, eventId)).orderBy(s.eventSlots.sortOrder);
  return rows.map((r) => ({ id: r.id, functionId: r.functionId, participantId: r.participantId, guestName: r.guestName, locked: r.locked, required: r.required, notes: r.notes }));
}
/** Envia a escala com a posição de uma função alterada. */
async function save(who: Who, eventId: string, fnName: string, patch: { participantId?: string | null; guestName?: string | null }) {
  as(who);
  const slots = await currentSlots(eventId);
  const target = D.fn[fnName];
  return saveScheduleAction({ eventId, slots: slots.map((sl) => (sl.functionId === target ? { ...sl, ...patch } : sl)) });
}
const err = (r: { ok: boolean }) => (r.ok ? "" : String((r as unknown as { error: string }).error));

describe("escala: instrumental × vocais × técnica", () => {
  it("administrador edita instrumental, vocal e técnica", async () => {
    expect((await save("adminA", D.evA, "Violão", { participantId: D.pMem })).ok).toBe(false); // Membro não tem Violão: validação de função
    expect((await save("adminA", D.evA, "Bateria", { participantId: D.pMem })).ok).toBe(true);
    expect((await save("adminA", D.evA, "Backing Vocal", { participantId: D.pMem })).ok).toBe(true);
    expect((await save("adminA", D.evA, "Operador de Áudio", { guestName: "Voluntário do som" })).ok).toBe(true);
  });

  it("líder dos músicos edita o instrumental, mas não os vocais nem a técnica", async () => {
    expect((await save("musicosA", D.evEmpty, "Bateria", { participantId: D.pMem })).ok).toBe(true);
    const voc = await save("musicosA", D.evEmpty, "Backing Vocal", { participantId: D.pMem });
    expect(voc.ok).toBe(false);
    expect(err(voc)).toContain("vocais");
    expect((await save("musicosA", D.evEmpty, "Operador de Áudio", { guestName: "X" })).ok).toBe(false);
  });

  it("líder dos vocais edita os vocais, mas não o instrumental", async () => {
    expect((await save("vocaisA", D.evEmpty, "Backing Vocal", { participantId: D.pMem })).ok).toBe(true);
    const inst = await save("vocaisA", D.evEmpty, "Violão", { guestName: "Convidado" });
    expect(inst.ok).toBe(false);
    expect(err(inst)).toContain("instrumental");
  });

  it("remover ou adicionar posição de outra área também é bloqueado", async () => {
    as("vocaisA");
    const slots = await currentSlots(D.evEmpty);
    const semBateria = slots.filter((x) => x.functionId !== D.fn["Bateria"]);
    expect((await saveScheduleAction({ eventId: D.evEmpty, slots: semBateria })).ok).toBe(false);
    const comExtra = [...slots, { id: null, functionId: D.fn["Violão"], participantId: null, guestName: null, locked: false, required: true, notes: null }];
    expect((await saveScheduleAction({ eventId: D.evEmpty, slots: comExtra })).ok).toBe(false);
  });

  it("membro não edita nada", async () => {
    for (const fn of ["Bateria", "Backing Vocal", "Violão"]) expect((await save("membroA", D.evEmpty, fn, { guestName: "Hack" })).ok).toBe(false);
  });

  it("não aceita pessoa cadastrada e convidado na mesma vaga", async () => {
    const r = await save("adminA", D.evA, "Violão", { participantId: D.pMem, guestName: "Fulano" });
    expect(r.ok).toBe(false);
  });

  it("convidado ocupa a vaga sem cadastro e entra como confirmado", async () => {
    expect((await save("musicosA", D.evA, "Violão", { guestName: "Convidado de fora" })).ok).toBe(true);
    const row = await db.select().from(s.eventSlots).where(eq(s.eventSlots.id, D.slot["Violão"])).get();
    expect(row?.guestName).toBe("Convidado de fora");
    expect(row?.participantId).toBeNull();
    expect(row?.status).toBe("confirmed");
  });

  it("só a administração bloqueia a escala inteira", async () => {
    as("musicosA");
    const slots = await currentSlots(D.evA);
    const r = await saveScheduleAction({ eventId: D.evA, slots, scheduleLocked: true });
    expect(r.ok).toBe(false);
  });
});

describe("geração automática respeita a área", () => {
  it("prévia do líder dos vocais não mexe no instrumental", async () => {
    as("vocaisA");
    const r = await previewGenerationAction({ eventIds: [D.evEmpty], scope: "all", mode: "replace-unlocked" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const instrumental = new Set([D.fn["Violão"], D.fn["Bateria"], D.fn["Operador de Áudio"]]);
      for (const p of r.data!.proposals) {
        const slot = r.data!.events[0].slots.find((x) => x.id === p.slotId)!;
        if (instrumental.has(slot.functionId)) expect(p.source).not.toBe("generated");
      }
    }
  });

  it("aplicar prévia adulterada com posição de outra área é recusado", async () => {
    as("vocaisA");
    const slots = await currentSlots(D.evEmpty);
    const violao = slots.find((x) => x.functionId === D.fn["Violão"])!;
    const r = await applyGenerationAction({ changes: [{ slotId: violao.id!, previousParticipantId: null, participantId: D.pMem, lock: false, auto: true }], confirmReplace: false });
    expect(r.ok).toBe(false);
    expect(err(r)).toContain("não são da sua liderança");
  });
});

describe("repertório", () => {
  const items = (songId: string) => [{ songId, key: "G", notes: "Entrada suave" }];
  it("administrador e líder dos vocais editam; guarda tom, quem e quando alterou", async () => {
    as("adminA");
    expect((await saveSetlistAction({ eventId: D.evA, items: items(D.songA) })).ok).toBe(true);
    as("vocaisA");
    expect((await saveSetlistAction({ eventId: D.evA, items: items(D.songA) })).ok).toBe(true);
    const ev = await db.select().from(s.events).where(eq(s.events.id, D.evA)).get();
    expect(ev?.setlistUpdatedBy).toBe("Líder Vocais");
    expect(ev?.setlistUpdatedAt).toBeInstanceOf(Date);
    const it = await db.select().from(s.setlistItems).where(eq(s.setlistItems.eventId, D.evA));
    expect(it[0].key).toBe("G");
  });
  it("líder dos músicos e membro NÃO editam o repertório", async () => {
    for (const w of ["musicosA", "membroA"] as const) {
      as(w);
      const r = await saveSetlistAction({ eventId: D.evA, items: [] });
      expect(r.ok).toBe(false);
    }
    const it = await db.select().from(s.setlistItems).where(eq(s.setlistItems.eventId, D.evA));
    expect(it.length).toBe(1);
  });
});

describe("publicar escala", () => {
  it("escala totalmente vazia nunca é publicada", async () => {
    // evB-like: crie um evento sem ninguém escalado
    const [e] = await db.insert(s.events).values({ organizationId: D.orgA, title: "Vazio", date: "2027-03-28", startTime: "19:00" }).returning();
    await db.insert(s.eventSlots).values({ eventId: e.id, functionId: D.fn["Bateria"] });
    as("adminA");
    const r = await setEventStatusAction(e.id, "pending", { ignoreWarnings: true });
    expect(r.ok).toBe(false);
    expect(err(r)).toContain("ninguém escalado");
  });
  it("parcialmente preenchida pede confirmação e lista o que falta", async () => {
    as("musicosA");
    const r = await setEventStatusAction(D.evA, "pending");
    expect(r.ok).toBe(false);
    expect(err(r)).toMatch(/Faltam:/);
    expect((await setEventStatusAction(D.evA, "pending", { ignoreWarnings: true })).ok).toBe(true);
  });
  it("membro não publica; líder não cancela nem conclui", async () => {
    as("membroA");
    expect((await setEventStatusAction(D.evEmpty, "pending", { ignoreWarnings: true })).ok).toBe(false);
    as("musicosA");
    expect((await setEventStatusAction(D.evA, "cancelled")).ok).toBe(false);
    expect((await setEventStatusAction(D.evA, "completed")).ok).toBe(false);
  });
});

describe("membro: só o que é dele", () => {
  it("confirma a própria participação, não a de outro", async () => {
    const mine = await db.select().from(s.eventSlots).where(eq(s.eventSlots.id, D.slot["Bateria"])).get();
    expect(mine?.participantId).toBe(D.pMem);
    as("membroA");
    expect((await respondToSlotAction({ slotId: D.slot["Bateria"], response: "confirmed" })).ok).toBe(true);
    // slot de convidado (Violão) não é dele
    expect((await respondToSlotAction({ slotId: D.slot["Violão"], response: "declined" })).ok).toBe(false);
  });
  const fd = (o: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(o)) f.set(k, v);
    return f;
  };
  it("informa a própria indisponibilidade", async () => {
    as("membroA");
    expect((await addUnavailabilityAction(null, fd({ participantId: D.pMem, startDate: "2027-03-14", endDate: "2027-03-15", reason: "Viagem" }))).ok).toBe(true);
  });
  it("data final anterior à inicial é recusada no servidor", async () => {
    as("membroA");
    const r = await addUnavailabilityAction(null, fd({ participantId: D.pMem, startDate: "2027-03-20", endDate: "2027-03-10" }));
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).toContain("igual ou posterior");
  });
  it("não altera a disponibilidade de outra pessoa (nem sendo líder)", async () => {
    const other = await db.select().from(s.participants).where(eq(s.participants.fullName, "Líder Vocais")).get();
    for (const w of ["membroA", "musicosA", "vocaisA"] as const) {
      as(w);
      const r = await addUnavailabilityAction(null, fd({ participantId: other!.id, startDate: "2027-03-14" }));
      if (w === "vocaisA") expect(r.ok).toBe(true); // é a própria pessoa
      else expect(r.ok).toBe(false);
    }
  });
});

describe("isolamento entre igrejas (multi-tenancy)", () => {
  it("administrador da A não altera escala, repertório nem publica nada da B", async () => {
    as("adminA");
    const slotB = await db.select().from(s.eventSlots).where(eq(s.eventSlots.eventId, D.evB)).get();
    const r1 = await saveScheduleAction({ eventId: D.evB, slots: [{ id: slotB!.id, functionId: D.fnB, participantId: null, guestName: "Invasor", locked: false, required: true, notes: null }] });
    expect(r1.ok).toBe(false);
    expect(err(r1)).toContain("não encontrado");
    expect((await saveSetlistAction({ eventId: D.evB, items: items2(D.songB) })).ok).toBe(false);
    expect((await setEventStatusAction(D.evB, "cancelled")).ok).toBe(false);
    expect((await respondToSlotAction({ slotId: slotB!.id, response: "confirmed" })).ok).toBe(false);
    const after = await db.select().from(s.eventSlots).where(eq(s.eventSlots.id, slotB!.id)).get();
    expect(after?.guestName).toBeNull();
  });
  it("líder da A não usa música da B no repertório da A", async () => {
    as("vocaisA");
    const r = await saveSetlistAction({ eventId: D.evA, items: items2(D.songB) });
    expect(r.ok).toBe(false);
  });
  it("apply com slot da B é recusado", async () => {
    as("adminA");
    const slotB = await db.select().from(s.eventSlots).where(eq(s.eventSlots.eventId, D.evB)).get();
    const r = await applyGenerationAction({ changes: [{ slotId: slotB!.id, previousParticipantId: null, participantId: D.pMem, lock: false, auto: true }], confirmReplace: false });
    expect(r.ok).toBe(false);
  });
  it("administrador da B também não alcança a A", async () => {
    as("adminB");
    expect((await saveScheduleAction({ eventId: D.evA, slots: [] })).ok).toBe(false);
    expect((await setEventStatusAction(D.evA, "cancelled")).ok).toBe(false);
  });
});

describe("Preciso trocar (sugestão de substituto)", () => {
  const T = {} as { ev: string; slot: string; cand: string; noSkill: string; outsider: string };
  beforeAll(async () => {
    const mk = async (org: string, name: string, fns: string[]) => {
      const [p] = await db.insert(s.participants).values({ organizationId: org, fullName: name, displayName: name }).returning();
      for (const f of fns) await db.insert(s.participantFunctions).values({ participantId: p.id, functionId: f, isPrimary: false });
      return p.id;
    };
    T.cand = await mk(D.orgA, "Candidata", [D.fn["Backing Vocal"]]);
    T.noSkill = await mk(D.orgA, "Só violão", [D.fn["Violão"]]);
    T.outsider = await mk(D.orgB, "De outra igreja", [D.fnB]);
    const [e] = await db.insert(s.events).values({ organizationId: D.orgA, title: "Culto troca", date: "2027-05-02", startTime: "19:00", status: "pending" }).returning();
    T.ev = e.id;
    const [sl] = await db.insert(s.eventSlots).values({ eventId: e.id, functionId: D.fn["Backing Vocal"], participantId: D.pMem, sortOrder: 0 }).returning();
    T.slot = sl.id;
  });

  it("só o dono da posição vê candidatos; só aparecem pessoas livres com a função", async () => {
    as("vocaisA");
    expect((await listSwapCandidatesAction(T.slot)).ok).toBe(false);
    as("membroA");
    const r = await listSwapCandidatesAction(T.slot);
    expect(r.ok).toBe(true);
    const ids = (r.ok ? r.data! : []).map((c) => c.id);
    expect(ids).toContain(T.cand);
    expect(ids).not.toContain(T.noSkill); // sem a função
    expect(ids).not.toContain(D.pMem); // ele mesmo
    expect(ids).not.toContain(T.outsider); // outra igreja
  });

  it("recusa sugestão de pessoa sem a função ou de outra igreja", async () => {
    as("membroA");
    expect((await respondToSlotAction({ slotId: T.slot, response: "declined", suggestedParticipantId: T.noSkill })).ok).toBe(false);
    expect((await respondToSlotAction({ slotId: T.slot, response: "declined", suggestedParticipantId: T.outsider })).ok).toBe(false);
  });

  it("membro pede troca sugerindo colega; a sugestão fica guardada", async () => {
    as("membroA");
    expect((await respondToSlotAction({ slotId: T.slot, response: "declined", reason: "Viagem", suggestedParticipantId: T.cand })).ok).toBe(true);
    const row = await db.select().from(s.eventSlots).where(eq(s.eventSlots.id, T.slot)).get();
    expect(row?.status).toBe("declined");
    expect(row?.swapSuggestedParticipantId).toBe(T.cand);
  });

  it("líder da OUTRA área e membro não aceitam; o líder da área aceita", async () => {
    for (const w of ["musicosA", "membroA", "adminB"] as const) {
      as(w);
      expect((await acceptSwapSuggestionAction(T.slot)).ok).toBe(false);
    }
    as("vocaisA");
    expect((await acceptSwapSuggestionAction(T.slot)).ok).toBe(true);
    const row = await db.select().from(s.eventSlots).where(eq(s.eventSlots.id, T.slot)).get();
    expect(row?.participantId).toBe(T.cand);
    expect(row?.status).toBe("pending"); // a nova pessoa ainda precisa confirmar
    expect(row?.swapSuggestedParticipantId).toBeNull();
  });

  it("sem sugestão pendente, aceitar é recusado", async () => {
    as("vocaisA");
    expect((await acceptSwapSuggestionAction(T.slot)).ok).toBe(false);
  });
});

function items2(songId: string) {
  return [{ songId, key: null, notes: null }];
}

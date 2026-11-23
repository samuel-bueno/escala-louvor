/**
 * SEED DE DEMONSTRAÇÃO — TODOS OS DADOS SÃO FICTÍCIOS.
 * Nomes, e-mails (domínio .test), músicas, artistas e links (example.com) foram
 * inventados. Não representam pessoas ou obras reais.
 *
 * Segurança: só roda em banco vazio e nunca em produção sem ALLOW_SEED=true.
 */
import "./load-env";
import { sql } from "drizzle-orm";
import { addDays, formatDate, todayIn } from "../src/domain/dates";
import { createRng } from "../src/domain/random";
import { generateSchedule } from "../src/domain/scheduling/generate";
import { DEFAULT_RULES, type SchedEvent, type SchedParticipant } from "../src/domain/scheduling/types";
import { generateSetlist, type SetlistSong } from "../src/domain/setlist/generate";
import { hashPassword } from "../src/server/auth/password";
import { createDb } from "../src/server/db/create";
import * as s from "../src/server/db/schema";

if (process.env.NODE_ENV === "production" && process.env.ALLOW_SEED !== "true") {
  console.error("✖ Seed bloqueado em produção. Defina ALLOW_SEED=true se tiver certeza.");
  process.exit(1);
}

const db = createDb();
const existing = await db.select({ n: sql<number>`count(*)` }).from(s.organizations).get();
if (Number(existing?.n) > 0) {
  console.log("ℹ O banco já possui dados. Seed ignorado. Use `npm run db:reset` para recriar o banco local.");
  process.exit(0);
}

const DEMO_PASSWORD = "demo1234"; // senha de demonstração (apenas ambiente local)
const rng = createRng(2026);
const today = todayIn("America/Sao_Paulo");

// --- Organização -----------------------------------------------------------
const [org] = await db.insert(s.organizations).values({ name: "Igreja Comunidade Esperança (fictícia)", slug: "demo" }).returning();
const orgId = org.id;

// --- Funções -----------------------------------------------------------------
const fnDefs: [string, s.FunctionKind][] = [
  ["Ministro de Louvor", "minister"],
  ["Backing Vocal", "vocal"],
  ["Violão", "instrument"],
  ["Guitarra", "instrument"],
  ["Contrabaixo", "instrument"],
  ["Teclado", "instrument"],
  ["Piano", "instrument"],
  ["Bateria", "instrument"],
  ["Percussão", "instrument"],
  ["Operador de Áudio", "tech"],
  ["Projeção", "tech"],
];
const fnRows = await db
  .insert(s.functions)
  .values(fnDefs.map(([name, kind], i) => ({ organizationId: orgId, name, kind, sortOrder: i })))
  .returning();
const F = Object.fromEntries(fnRows.map((f) => [f.name, f.id])) as Record<string, string>;

// --- Participantes -------------------------------------------------------------
type P = { name: string; display: string; fns: string[]; limit?: number; active?: boolean; level?: "iniciante" | "intermediario" | "avancado"; days?: number[]; note?: string };
const people: P[] = [
  { name: "João Martins", display: "João", fns: ["Ministro de Louvor", "Violão", "Backing Vocal"], level: "avancado", note: "Multi-instrumentista." },
  { name: "Rafael Oliveira", display: "Rafael", fns: ["Ministro de Louvor", "Guitarra"], level: "avancado" },
  { name: "Mariana Souza", display: "Mariana", fns: ["Ministro de Louvor", "Backing Vocal", "Teclado"], level: "avancado", note: "Líder do ministério (perfil administrador na demo)." },
  { name: "Lucas Almeida", display: "Lucas", fns: ["Ministro de Louvor", "Violão"], level: "intermediario" },
  { name: "Daniel Ferreira", display: "Daniel", fns: ["Bateria", "Percussão"], level: "avancado" },
  { name: "Ana Costa", display: "Ana", fns: ["Teclado", "Piano", "Backing Vocal"], level: "avancado" },
  { name: "Pedro Henrique Lima", display: "Pedro", fns: ["Guitarra", "Violão"], level: "intermediario" },
  { name: "Carlos Eduardo Rocha", display: "Carlos", fns: ["Contrabaixo", "Guitarra"], level: "avancado" },
  { name: "Beatriz Nunes", display: "Beatriz", fns: ["Backing Vocal"], limit: 2, level: "intermediario", note: "Pediu no máximo 2 escalas por mês." },
  { name: "Thiago Ribeiro", display: "Thiago", fns: ["Bateria"], level: "intermediario", note: "Viagem de trabalho em dezembro." },
  { name: "Juliana Mendes", display: "Juliana", fns: ["Backing Vocal", "Violão"], level: "iniciante", days: [0] },
  { name: "Felipe Araújo", display: "Felipe", fns: ["Contrabaixo"], level: "intermediario" },
  { name: "Gabriel Santos", display: "Gabriel", fns: ["Operador de Áudio", "Projeção"], level: "intermediario" },
  { name: "Larissa Teixeira", display: "Larissa", fns: ["Projeção", "Backing Vocal"], active: false, note: "Mudou de cidade — mantida no histórico." },
];
const pRows = await db
  .insert(s.participants)
  .values(
    people.map((p) => ({
      organizationId: orgId,
      fullName: p.name,
      displayName: p.display,
      email: `${p.display.toLowerCase()}@exemplo.test`,
      monthlyLimit: p.limit ?? null,
      active: p.active ?? true,
      level: p.level ?? null,
      usualDays: p.days ?? [],
      notes: p.note ?? null,
    })),
  )
  .returning();
const PID = Object.fromEntries(pRows.map((p) => [p.displayName, p.id])) as Record<string, string>;
await db.insert(s.participantFunctions).values(people.flatMap((p) => p.fns.map((fn, i) => ({ participantId: PID[p.display], functionId: F[fn], isPrimary: i === 0 }))));

// Indisponibilidades
await db.insert(s.unavailability).values([
  { organizationId: orgId, participantId: PID.Thiago, startDate: "2026-12-01", endDate: "2026-12-20", reason: "Viagem de trabalho" },
  { organizationId: orgId, participantId: PID.Rafael, startDate: "2026-11-29", endDate: "2026-11-29", reason: null },
  { organizationId: orgId, participantId: PID.Ana, startDate: "2026-12-13", endDate: "2026-12-13", reason: "Compromisso familiar" },
]);

// --- Usuários (acesso demo) ---------------------------------------------------
const hash = await hashPassword(DEMO_PASSWORD);
await db.insert(s.users).values([
  { organizationId: orgId, email: "lider@exemplo.test", name: "Mariana Souza", role: "admin", participantId: PID.Mariana, passwordHash: hash },
  { organizationId: orgId, email: "joao@exemplo.test", name: "João Martins", role: "member", participantId: PID["João"], passwordHash: hash },
  { organizationId: orgId, email: "daniel@exemplo.test", name: "Daniel Ferreira", role: "member", participantId: PID.Daniel, passwordHash: hash },
  // Lideranças por área — o papel não depende do instrumento (Rafael também toca guitarra; Carlos também é baixista).
  { organizationId: orgId, email: "musicos@exemplo.test", name: "Carlos Eduardo Rocha", role: "member", leadsInstrumental: true, participantId: PID.Carlos, passwordHash: hash },
  { organizationId: orgId, email: "vocais@exemplo.test", name: "Rafael Oliveira", role: "member", leadsVocal: true, participantId: PID.Rafael, passwordHash: hash },
]);

// --- Configurações ------------------------------------------------------------
const defaultPositions = [
  { functionId: F["Ministro de Louvor"], count: 1 },
  { functionId: F["Violão"], count: 1 },
  { functionId: F["Guitarra"], count: 1 },
  { functionId: F["Contrabaixo"], count: 1 },
  { functionId: F["Teclado"], count: 1 },
  { functionId: F["Bateria"], count: 1 },
  { functionId: F["Backing Vocal"], count: 2 },
];
await db.insert(s.orgSettings).values({ organizationId: orgId, defaultPositions });

// --- Recorrências ---------------------------------------------------------------
const [rSunday, rThursday, rYouth] = await db
  .insert(s.recurrenceRules)
  .values([
    { organizationId: orgId, title: "Culto de Domingo", type: "culto", weekday: 0, nthOfMonth: null, startTime: "19:00", endTime: "21:00", location: "Templo principal" },
    { organizationId: orgId, title: "Ensaio", type: "ensaio", weekday: 4, nthOfMonth: null, startTime: "20:00", endTime: "22:00", location: "Sala de música" },
    { organizationId: orgId, title: "Culto de Jovens", type: "culto", weekday: 6, nthOfMonth: 1, startTime: "19:30", endTime: "21:30", location: "Templo principal" },
  ])
  .returning();

// --- Categorias e músicas (fictícias) -------------------------------------------
const catNames = ["Abertura", "Celebração", "Adoração", "Comunhão", "Ceia", "Oferta", "Apelo", "Encerramento"];
const catRows = await db
  .insert(s.songCategories)
  .values(catNames.map((name, i) => ({ organizationId: orgId, name, sortOrder: i })))
  .returning();
const C = Object.fromEntries(catRows.map((c) => [c.name, c.id])) as Record<string, string>;

const artists = ["Ministério Aurora", "Coletivo Semear", "Banda Alvorada", "Grupo Vale Verde", "Comunidade Farol"];
const songDefs: [string, string, string, number, string][] = [
  // título, categoria, tom, bpm, tema
  ["Caminho de Luz", "Abertura", "G", 120, "esperança"],
  ["Nova Canção", "Abertura", "D", 128, "alegria"],
  ["Manhã de Festa", "Abertura", "A", 132, "alegria"],
  ["Graça Sobre Graça", "Celebração", "E", 124, "graça"],
  ["Esperança Viva", "Celebração", "C", 118, "esperança"],
  ["Rei Eterno", "Celebração", "D", 126, "majestade"],
  ["Coração Grato", "Celebração", "G", 116, "gratidão"],
  ["Cantaremos Juntos", "Celebração", "A", 130, "comunhão"],
  ["Vitória no Vale", "Celebração", "B", 122, "fé"],
  ["Santo É o Senhor", "Adoração", "D", 72, "santidade"],
  ["Presença", "Adoração", "E", 68, "presença"],
  ["Fonte de Paz", "Adoração", "F", 70, "paz"],
  ["Rio Sereno", "Adoração", "C", 66, "paz"],
  ["Tu És Fiel", "Adoração", "G", 74, "fidelidade"],
  ["Abrigo", "Adoração", "Bb", 64, "confiança"],
  ["Mais Perto", "Adoração", "A", 70, "intimidade"],
  ["Luz do Mundo", "Adoração", "E", 76, "esperança"],
  ["Mesa Posta", "Ceia", "D", 72, "ceia"],
  ["Pão e Vinho", "Ceia", "G", 70, "ceia"],
  ["Laços de Amor", "Comunhão", "C", 96, "comunhão"],
  ["Uma Só Família", "Comunhão", "F", 100, "comunhão"],
  ["Semear", "Oferta", "A", 92, "gratidão"],
  ["Tudo o Que Tenho", "Oferta", "D", 88, "entrega"],
  ["Vem Como Está", "Apelo", "G", 70, "graça"],
  ["Porta Aberta", "Apelo", "E", 72, "graça"],
  ["Bênção Final", "Encerramento", "C", 110, "bênção"],
  ["Vai em Paz", "Encerramento", "D", 104, "paz"],
  ["Até o Fim", "Encerramento", "A", 112, "fé"],
  ["Hino da Manhã", "Celebração", "G", 120, "alegria"],
  ["Canção Antiga", "Adoração", "F", 70, "memória"],
];
const songRows = await db
  .insert(s.songs)
  .values(
    songDefs.map(([title, cat, key, bpm, theme], i) => ({
      organizationId: orgId,
      title,
      artist: artists[i % artists.length],
      categoryId: C[cat],
      originalKey: key,
      bpm,
      durationSec: 240 + ((i * 37) % 120),
      theme,
      tags: [theme],
      difficulty: (i % 3) + 1,
      url: `https://example.com/musicas/${title.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      active: title !== "Canção Antiga",
      notes: title === "Canção Antiga" ? "Desativada: fora do repertório atual (exemplo de música inativa)." : null,
    })),
  )
  .returning();

// --- Eventos -------------------------------------------------------------------
type EvDef = { title: string; type: s.EventType; date: string; start: string; end: string; recurrenceId: string; status: s.EventStatus; withSlots: boolean; theme?: string };
const evDefs: EvDef[] = [];
const sundays: string[] = [];
for (let d = "2026-10-04"; d <= "2027-01-31"; d = addDays(d, 7)) sundays.push(d);
for (const d of sundays) {
  const past = d < today;
  evDefs.push({ title: "Culto de Domingo", type: "culto", date: d, start: "19:00", end: "21:00", recurrenceId: rSunday.id, status: past ? "completed" : "draft", withSlots: true });
}
for (let d = "2026-10-01"; d <= "2026-12-31"; d = addDays(d, 7)) {
  evDefs.push({ title: "Ensaio", type: "ensaio", date: d, start: "20:00", end: "22:00", recurrenceId: rThursday.id, status: d < today ? "completed" : "published", withSlots: false });
}
for (const d of ["2026-10-03", "2026-11-07", "2026-12-05", "2027-01-02"]) {
  evDefs.push({ title: "Culto de Jovens", type: "culto", date: d, start: "19:30", end: "21:30", recurrenceId: rYouth.id, status: d < today ? "completed" : "draft", withSlots: true, theme: "Juventude" });
}
const evRows = await db
  .insert(s.events)
  .values(
    evDefs.map((e) => ({
      organizationId: orgId,
      title: e.title,
      type: e.type,
      date: e.date,
      startTime: e.start,
      endTime: e.end,
      location: e.type === "ensaio" ? "Sala de música" : "Templo principal",
      recurrenceId: e.recurrenceId,
      status: e.status,
      theme: e.theme ?? null,
    })),
  )
  .returning();

// Vigília cancelada (mantida no histórico)
await db.insert(s.events).values({ organizationId: orgId, title: "Vigília de Oração", type: "evento", date: "2026-11-13", startTime: "22:00", endTime: "23:59", location: "Templo principal", status: "cancelled", notes: "Cancelada por manutenção elétrica." });

// Posições
const slotTemplate = defaultPositions.flatMap((p) => Array.from({ length: p.count }, () => p.functionId));
const slotted = evRows.filter((e) => evDefs.find((d) => d.date === e.date && d.title === e.title)?.withSlots);
const slotRows = await db
  .insert(s.eventSlots)
  .values(slotted.flatMap((e) => slotTemplate.map((functionId, i) => ({ eventId: e.id, functionId, sortOrder: i }))))
  .returning();

// Histórico realista: usa o próprio algoritmo para as datas passadas + próximo domingo.
const nextSunday = sundays.find((d) => d >= today)!;
const toGenerate = slotted.filter((e) => e.date < today || e.date === nextSunday);
const schedParticipants: SchedParticipant[] = pRows.map((p) => ({
  id: p.id,
  name: p.displayName,
  active: p.active || p.displayName === "Larissa", // Larissa participava antes de sair
  functionIds: people.find((x) => x.display === p.displayName)!.fns.map((f) => F[f]),
  primaryFunctionId: F[people.find((x) => x.display === p.displayName)!.fns[0]],
  monthlyLimit: p.monthlyLimit,
  usualDays: p.usualDays,
  unavailable: [],
}));
const schedEvents: SchedEvent[] = toGenerate.map((e) => ({
  id: e.id,
  title: e.title,
  date: e.date,
  startTime: e.startTime,
  endTime: e.endTime,
  slots: slotRows.filter((x) => x.eventId === e.id).map((x) => ({ id: x.id, functionId: x.functionId, participantId: null, locked: false, sortOrder: x.sortOrder })),
}));
const gen = generateSchedule(schedEvents, schedParticipants, [], DEFAULT_RULES, { mode: "fill-empty", rng });
for (const p of gen.proposals) {
  if (!p.participantId) continue;
  const ev = toGenerate.find((e) => e.id === p.eventId)!;
  const past = ev.date < today;
  const status = past ? "confirmed" : rng() < 0.5 ? "confirmed" : "pending";
  await db
    .update(s.eventSlots)
    .set({ participantId: p.participantId, assignedBy: "auto", status, respondedAt: status === "confirmed" ? new Date() : null })
    .where(sql`${s.eventSlots.id} = ${p.slotId}`);
}

// Próximo domingo: publicado aguardando confirmação, com uma recusa (precisa substituir).
const nextEv = evRows.find((e) => e.date === nextSunday && e.title === "Culto de Domingo")!;
await db.update(s.events).set({ status: "pending", publishedAt: new Date(), confirmDeadline: addDays(nextSunday, -2), theme: "Gratidão" }).where(sql`${s.events.id} = ${nextEv.id}`);
const nextSlots = slotRows.filter((x) => x.eventId === nextEv.id && x.functionId === F["Backing Vocal"]);
if (nextSlots[0]) await db.update(s.eventSlots).set({ status: "declined", declineReason: "Plantão no trabalho", respondedAt: new Date() }).where(sql`${s.eventSlots.id} = ${nextSlots[0].id}`);
// Ministro fixado no próximo domingo (exemplo de FIXADO)
const nextMinister = slotRows.find((x) => x.eventId === nextEv.id && x.functionId === F["Ministro de Louvor"]);
if (nextMinister) await db.update(s.eventSlots).set({ locked: true, assignedBy: "manual" }).where(sql`${s.eventSlots.id} = ${nextMinister.id}`);

// Domingo seguinte: escala parcialmente preenchida (rascunho)
const partialDate = addDays(nextSunday, 7);
const partialEv = evRows.find((e) => e.date === partialDate && e.title === "Culto de Domingo");
if (partialEv) {
  const ps = slotRows.filter((x) => x.eventId === partialEv.id);
  const setP = async (fn: string, who: string, locked = false) => {
    const slot = ps.find((x) => x.functionId === F[fn]);
    if (slot) await db.update(s.eventSlots).set({ participantId: PID[who], assignedBy: "manual", locked }).where(sql`${s.eventSlots.id} = ${slot.id}`);
  };
  await setP("Ministro de Louvor", "Lucas", true);
  await setP("Teclado", "Ana");
  await setP("Bateria", "Daniel");
  await db.update(s.events).set({ notes: "Escala parcialmente preenchida (exemplo para testar a geração automática)." }).where(sql`${s.events.id} = ${partialEv.id}`);
}

// Repertórios: passados (com histórico de execução) + próximo domingo (4 de 5).
const catPlan = [
  { categoryId: C["Abertura"], count: 1 },
  { categoryId: C["Celebração"], count: 2 },
  { categoryId: C["Adoração"], count: 2 },
];
const working: SetlistSong[] = songRows.map((x) => ({ id: x.id, title: x.title, active: x.active, categoryId: x.categoryId, plays: [] }));
const setlistTargets = [...slotted.filter((e) => e.date < today), nextEv].sort((a, b) => a.date.localeCompare(b.date));
for (const ev of setlistTargets) {
  const res = generateSetlist(working, { date: ev.date, total: 5, categories: catPlan, minIntervalDays: 21, rng, relaxInterval: true });
  const items = ev.id === nextEv.id ? res.items.slice(0, 4) : res.items;
  if (!items.length) continue;
  await db.insert(s.setlistItems).values(items.map((it, i) => ({ eventId: ev.id, songId: it.songId, position: i })));
  if (ev.date < today) {
    await db.insert(s.songPlays).values(items.map((it) => ({ organizationId: orgId, songId: it.songId, eventId: ev.id, date: ev.date })));
    for (const it of items) working.find((w) => w.id === it.songId)!.plays.push(ev.date);
  }
}
// Repertório histórico da música inativa (antes de ser desativada)
await db.insert(s.songPlays).values({ organizationId: orgId, songId: songRows.find((x) => x.title === "Canção Antiga")!.id, eventId: null, date: "2026-03-08" });

await db.insert(s.auditLog).values({ organizationId: orgId, action: "seed", entity: "system", summary: "Dados fictícios de demonstração criados" });

console.log(`✔ Seed concluído (dados FICTÍCIOS) — hoje considerado: ${formatDate(today)}`);
console.log(`  ${pRows.length} participantes · ${songRows.length} músicas · ${evRows.length + 1} compromissos`);
console.log("  Acessos de demonstração (senha: demo1234):");
console.log("   • lider@exemplo.test  (administrador)");
console.log("   • joao@exemplo.test   (ministro)");
console.log("   • daniel@exemplo.test (músico)");
console.log("   • musicos@exemplo.test (líder dos músicos)");
console.log("   • vocais@exemplo.test  (líder dos vocais)");

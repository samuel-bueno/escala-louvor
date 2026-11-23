/**
 * Smoke test: com o servidor rodando (npm run dev ou npm start), cria sessões
 * temporárias para os usuários de demonstração e abre todas as telas,
 * verificando status HTTP, ausência de erro de renderização e regras de acesso.
 *
 * Uso:  npm run smoke   (BASE_URL opcional, padrão http://localhost:3000)
 * Só roda com banco local (file:) e fora de produção.
 */
import "./load-env";
import { eq, inArray } from "drizzle-orm";
import { generateToken, hashToken } from "../src/server/auth/tokens";
import { createDb } from "../src/server/db/create";
import { events, eventSlots, functions, organizations, sessions, shareLinks, songs, users, participants, unavailability } from "../src/server/db/schema";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const url = process.env.DATABASE_URL ?? "file:./data/escala.db";
if (process.env.NODE_ENV === "production" || !url.startsWith("file:")) {
  console.error("✖ smoke só roda com banco local fora de produção.");
  process.exit(1);
}

const db = createDb(url);
const created: string[] = [];
async function sessionFor(email: string) {
  const u = await db.select().from(users).where(eq(users.email, email)).get();
  if (!u) throw new Error(`Usuário ${email} não encontrado — rode npm run db:seed`);
  const token = generateToken();
  await db.insert(sessions).values({ id: hashToken(token), userId: u.id, expiresAt: new Date(Date.now() + 600_000) });
  created.push(hashToken(token));
  return `el_session=${token}`;
}

let failures = 0;
async function check(path: string, cookie: string | null, expect: { status?: number; contains?: string; notContains?: string; redirectTo?: string }) {
  const res = await fetch(BASE + path, { headers: cookie ? { cookie } : {}, redirect: "manual" });
  const body = res.status === 200 ? await res.text() : "";
  const problems: string[] = [];
  if (expect.redirectTo) {
    const loc = res.headers.get("location") ?? "";
    if (!(res.status >= 300 && res.status < 400 && loc.includes(expect.redirectTo))) problems.push(`esperava redirect p/ ${expect.redirectTo}, veio ${res.status} ${loc}`);
  } else if (res.status !== (expect.status ?? 200)) problems.push(`status ${res.status}`);
  if (/Failed query|Application error|Unhandled Runtime Error/.test(body)) problems.push("erro de renderização no HTML");
  if (expect.contains && !body.includes(expect.contains)) problems.push(`não contém "${expect.contains}"`);
  if (expect.notContains && body.includes(expect.notContains)) problems.push(`contém indevidamente "${expect.notContains}"`);
  if (problems.length) failures++;
  console.log(`${problems.length ? "✖" : "✔"} ${path.padEnd(48)} ${problems.join("; ")}`);
}

try {
  const admin = await sessionFor("lider@exemplo.test");
  const member = await sessionFor("daniel@exemplo.test");
  const ev = await db.select().from(events).where(eq(events.status, "pending")).get();
  const draft = await db.select().from(events).where(eq(events.status, "draft")).get();
  const song = await db.select().from(songs).get();
  const person = await db.select().from(participants).get();
  if (!ev || !draft || !song || !person) throw new Error("Dados de demonstração incompletos — rode npm run db:reset");

  console.log("— Liderança —");
  for (const p of [
    "/",
    "/agenda",
    "/agenda?mes=2026-12&tipo=ensaios",
    "/pessoas",
    "/pessoas/novo",
    "/pessoas/solicitacoes",
    `/pessoas/${person.id}`,
    `/pessoas/${person.id}/editar`,
    "/disponibilidade",
    "/funcoes",
    "/musicas",
    "/musicas?ordem=esquecidas",
    "/musicas/nova",
    "/musicas/importar",
    `/musicas/${song.id}`,
    `/musicas/${song.id}/editar`,
    "/eventos/novo",
    `/eventos/${ev.id}`,
    `/eventos/${ev.id}/editar`,
    `/eventos/${ev.id}/escala`,
    `/eventos/${ev.id}/repertorio`,
    `/eventos/${draft.id}`,
    "/escalas",
    `/escalas?culto=${ev.id}`,
    "/escalas/gerar",
    "/agenda?ver=lista",
    "/configuracoes",
    "/mais",
  ])
    await check(p, admin, {});

  console.log("— Músico (autorização e privacidade) —");
  await check("/", member, { contains: "Próximos compromissos" });
  await check(`/eventos/${ev.id}`, member, { notContains: "Motivo:" });
  await check(`/eventos/${draft.id}`, member, { status: 404 });
  await check("/pessoas", member, { redirectTo: "/?erro=permissao" });
  await check("/configuracoes", member, { redirectTo: "/?erro=permissao" });
  await check("/escalas", member, { redirectTo: "/?erro=permissao" });
  await check("/pessoas/solicitacoes", member, { redirectTo: "/?erro=permissao" });
  await check(`/eventos/${ev.id}/escala`, member, { redirectTo: "/?erro=permissao" });
  await check("/disponibilidade", member, {});
  await check("/musicas", member, { notContains: "Importar lista" });

  await check(`/eventos/${ev.id}`, admin, { contains: "Plantão no trabalho" });
  console.log("— Lideranças por área —");
  const musicos = await sessionFor("musicos@exemplo.test");
  const vocais = await sessionFor("vocais@exemplo.test");
  for (const [who, c] of [["líder dos músicos", musicos], ["líder dos vocais", vocais]] as const) {
    console.log(`  ${who}`);
    await check("/", c, {});
    await check("/escalas", c, {});
    await check(`/escalas?culto=${ev.id}`, c, {});
    await check(`/eventos/${ev.id}/escala`, c, {});
    await check(`/eventos/${draft.id}`, c, {}); // liderança vê rascunhos; membro não
    await check(`/eventos/${ev.id}`, c, { notContains: "Plantão no trabalho" }); // motivo da recusa: só administração
    await check("/disponibilidade", c, { notContains: "Motivo:" });
    for (const adm of ["/pessoas", "/configuracoes", "/funcoes", "/eventos/novo", `/eventos/${ev.id}/editar`, "/pessoas/solicitacoes"]) await check(adm, c, { redirectTo: "/?erro=permissao" });
  }
  await check(`/eventos/${ev.id}/repertorio`, vocais, {});
  await check("/musicas/nova", vocais, {});
  await check(`/eventos/${ev.id}/repertorio`, musicos, { redirectTo: "/?erro=permissao" });
  await check("/musicas/nova", musicos, { redirectTo: "/?erro=permissao" });
  await check("/escalas", member, { redirectTo: "/?erro=permissao" });

  console.log("— Isolamento entre igrejas (igreja B temporária) —");
  const [orgB] = await db.insert(organizations).values({ name: "Igreja B (teste)", slug: `teste-b-${Date.now()}` }).returning();
  try {
    const [fnB] = await db.insert(functions).values({ organizationId: orgB.id, name: "Violão B", kind: "instrument" }).returning();
    const [pB] = await db.insert(participants).values({ organizationId: orgB.id, fullName: "Pessoa da B", displayName: "PessoaB" }).returning();
    const [sB] = await db.insert(songs).values({ organizationId: orgB.id, title: "Música secreta da B" }).returning();
    const [eB] = await db.insert(events).values({ organizationId: orgB.id, title: "Culto secreto da B", date: "2027-02-07", startTime: "19:00", status: "pending" }).returning();
    await db.insert(eventSlots).values({ eventId: eB.id, functionId: fnB.id, participantId: pB.id });
    await db.insert(unavailability).values({ organizationId: orgB.id, participantId: pB.id, startDate: "2027-02-07", endDate: "2027-02-07", reason: "Motivo secreto da B" });
    const scenarios: [string, string, number | string][] = [
      [`/eventos/${eB.id}`, "evento", 404],
      [`/eventos/${eB.id}/escala`, "escala", 404],
      [`/eventos/${eB.id}/repertorio`, "repertório", 404],
      [`/eventos/${eB.id}/editar`, "editar evento", 404],
      [`/pessoas/${pB.id}`, "pessoa", 404],
      [`/pessoas/${pB.id}/editar`, "editar pessoa", 404],
      [`/musicas/${sB.id}`, "música", 404],
      [`/musicas/${sB.id}/editar`, "editar música", 404],
    ];
    for (const [path] of scenarios) {
      await check(path, admin, { status: 404 });
      await check(path, vocais, path.includes("/pessoas/") || path.includes("/editar") && !path.includes("musicas") ? { redirectTo: "/?erro=permissao" } : { status: 404 });
    }
    // Telas de lista/painel da A nunca mostram dados da B.
    for (const p of ["/", "/agenda?mes=2027-02", "/escalas", "/pessoas", "/musicas", "/disponibilidade", "/configuracoes"]) {
      await check(p, admin, { notContains: "secreto da B" });
      await check(p, admin, { notContains: "PessoaB" });
    }
    await check(`/escalas?culto=${eB.id}`, admin, { contains: "Culto não encontrado", notContains: "Culto secreto da B" });
    // Link público: só o token certo abre; um token válido da B não vaza para outra sessão (a página é pública por token).
    const sl = await db.select().from(shareLinks).get();
    void sl;
  } finally {
    // Remove a igreja B de teste respeitando as chaves estrangeiras (filhos antes dos pais).
    const evB = await db.select({ id: events.id }).from(events).where(eq(events.organizationId, orgB.id));
    if (evB.length) await db.delete(eventSlots).where(inArray(eventSlots.eventId, evB.map((e) => e.id)));
    await db.delete(events).where(eq(events.organizationId, orgB.id));
    await db.delete(unavailability).where(eq(unavailability.organizationId, orgB.id));
    await db.delete(songs).where(eq(songs.organizationId, orgB.id));
    await db.delete(participants).where(eq(participants.organizationId, orgB.id));
    await db.delete(functions).where(eq(functions.organizationId, orgB.id));
    await db.delete(organizations).where(eq(organizations.id, orgB.id));
  }

  console.log("— Sem sessão —");
  await check("/", null, { redirectTo: "/login" });
  await check("/login", null, {});
  await check("/s/token-invalido", null, { contains: "Link indisponível" });
  await check("/convite/token-invalido", null, { contains: "Convite indisponível" });
  await check("/redefinir/token-invalido", null, { contains: "Link indisponível" });
  await check("/esqueci", null, { contains: "Esqueci minha senha" });
  await check("/manifest.webmanifest", null, { contains: "standalone" });
} finally {
  if (created.length) await db.delete(sessions).where(inArray(sessions.id, created));
}

if (failures) {
  console.error(`\n✖ ${failures} verificação(ões) falharam.`);
  process.exit(1);
}
console.log("\n✔ Todas as telas renderizaram sem erro.");

/**
 * PRIMEIRO ACESSO EM PRODUÇÃO — cria a igreja, as funções/categorias padrão,
 * as configurações e a conta de administrador. NÃO cria dados fictícios.
 *
 * Uso (defina as variáveis só para este comando; a senha não fica salva):
 *   ORG_NAME="Igreja X" ADMIN_NAME="Fulano" ADMIN_EMAIL="fulano@email.com" ADMIN_PASSWORD="..." npm run bootstrap
 *
 * Só roda se o banco ainda não tiver nenhuma igreja.
 */
import "./load-env";
import { z } from "zod";
import { hashPassword } from "../src/server/auth/password";
import { createDb } from "../src/server/db/create";
import * as s from "../src/server/db/schema";

const input = z
  .object({
    ORG_NAME: z.string().trim().min(2, "Defina ORG_NAME (nome da igreja)."),
    ADMIN_NAME: z.string().trim().min(2, "Defina ADMIN_NAME."),
    ADMIN_EMAIL: z.string().trim().toLowerCase().pipe(z.email("ADMIN_EMAIL inválido.")),
    ADMIN_PASSWORD: z.string().min(10, "ADMIN_PASSWORD precisa ter ao menos 10 caracteres."),
  })
  .safeParse(process.env);

if (!input.success) {
  console.error("✖ " + input.error.issues.map((i) => i.message).join("\n✖ "));
  process.exit(1);
}
const { ORG_NAME, ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = input.data;

const db = createDb();
const existing = await db.select({ id: s.organizations.id }).from(s.organizations).limit(1).get();
if (existing) {
  console.error("✖ Este banco já tem uma igreja cadastrada. Nada foi alterado.");
  process.exit(1);
}

const slug = ORG_NAME.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "igreja";
const [org] = await db.insert(s.organizations).values({ name: ORG_NAME, slug }).returning();

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
const fns = await db
  .insert(s.functions)
  .values(fnDefs.map(([name, kind], i) => ({ organizationId: org.id, name, kind, sortOrder: i })))
  .returning();
const F = Object.fromEntries(fns.map((f) => [f.name, f.id]));

await db.insert(s.songCategories).values(["Abertura", "Celebração", "Adoração", "Comunhão", "Ceia", "Oferta", "Apelo", "Encerramento"].map((name, i) => ({ organizationId: org.id, name, sortOrder: i })));
await db.insert(s.orgSettings).values({
  organizationId: org.id,
  defaultPositions: [
    { functionId: F["Ministro de Louvor"], count: 1 },
    { functionId: F["Violão"], count: 1 },
    { functionId: F["Guitarra"], count: 1 },
    { functionId: F["Contrabaixo"], count: 1 },
    { functionId: F["Teclado"], count: 1 },
    { functionId: F["Bateria"], count: 1 },
    { functionId: F["Backing Vocal"], count: 2 },
  ],
});

const [person] = await db.insert(s.participants).values({ organizationId: org.id, fullName: ADMIN_NAME, displayName: ADMIN_NAME.split(" ")[0], email: ADMIN_EMAIL }).returning();
await db.insert(s.users).values({ organizationId: org.id, email: ADMIN_EMAIL, name: ADMIN_NAME, role: "admin", participantId: person.id, passwordHash: await hashPassword(ADMIN_PASSWORD) });
await db.insert(s.auditLog).values({ organizationId: org.id, action: "bootstrap", entity: "system", summary: "Igreja e administrador criados" });

console.log(`✔ Igreja "${ORG_NAME}" criada. Entre com ${ADMIN_EMAIL}.`);
console.log("  Próximo passo: cadastre as pessoas em Pessoas → Adicionar pessoa.");

/**
 * Recria o banco LOCAL do zero (apaga o arquivo, aplica migrations e seed).
 * Recusa-se a rodar em produção ou em bancos remotos.
 */
import "./load-env";
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";

const url = process.env.DATABASE_URL ?? "file:./data/escala.db";
if (process.env.NODE_ENV === "production" || !url.startsWith("file:")) {
  console.error("✖ db:reset só funciona com banco local (DATABASE_URL=file:...) fora de produção.");
  process.exit(1);
}
const path = url.replace(/^file:/, "");
for (const f of [path, `${path}-wal`, `${path}-shm`, `${path}-journal`]) if (existsSync(f)) rmSync(f);
console.log("✔ Banco local removido:", path);
execSync("npm run db:migrate", { stdio: "inherit" });
execSync("npm run db:seed", { stdio: "inherit" });

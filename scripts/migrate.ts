import "./load-env";
import { migrate } from "drizzle-orm/libsql/migrator";
import { mkdirSync } from "node:fs";
import { checkDbConfig } from "../src/server/db/config";
import { createDb } from "../src/server/db/create";

const cfg = checkDbConfig(process.env.DATABASE_URL, process.env.DATABASE_AUTH_TOKEN, { onVercel: !!process.env.VERCEL });
const url = cfg.url;
if (url.startsWith("file:")) mkdirSync("data", { recursive: true });

const db = createDb(url, cfg.authToken);
await db.run("PRAGMA foreign_keys = ON");
await migrate(db, { migrationsFolder: "./drizzle" });
console.log("✔ Migrations aplicadas em", url.startsWith("file:") ? url.replace(/\?.*$/, "") : `${url.split(":")[0]}://…${new URL(url.replace(/^libsql:/i, "https:")).hostname.split(".").slice(-2).join(".")}`);

import "server-only";
import { createDb } from "./create";

declare global {
  var __escalaDb: ReturnType<typeof createDb> | undefined;
}

/** Conexão única por processo (evita múltiplas conexões no hot-reload). */
export const db = globalThis.__escalaDb ?? createDb();
if (process.env.NODE_ENV !== "production") globalThis.__escalaDb = db;
export type Db = typeof db;

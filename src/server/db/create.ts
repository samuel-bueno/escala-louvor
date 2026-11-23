import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { checkDbConfig } from "./config";
import * as schema from "./schema";

export function createDb(url = process.env.DATABASE_URL, authToken = process.env.DATABASE_AUTH_TOKEN) {
  const cfg = checkDbConfig(url, authToken, { onVercel: !!process.env.VERCEL });
  const client = createClient({ url: cfg.url, authToken: cfg.authToken });
  // SQLite só aplica foreign keys quando habilitado por conexão.
  client.execute("PRAGMA foreign_keys = ON").catch(() => {});
  return drizzle(client, { schema });
}

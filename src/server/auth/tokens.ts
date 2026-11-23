import { createHash, randomBytes } from "node:crypto";

/** Token forte (256 bits) para sessões e links públicos. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Só o hash é guardado no banco — um vazamento do banco não expõe tokens válidos. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

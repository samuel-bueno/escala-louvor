// Carrega .env para scripts CLI (Next carrega sozinho no app).
import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");

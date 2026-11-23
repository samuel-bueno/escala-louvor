/**
 * Importação em lote de músicas a partir de texto colado.
 *
 * Formatos aceitos por linha:
 *   Nome da música | URL
 *   Nome da música | Artista | URL
 *   Nome da música ; URL            (CSV simples com ; ou ,)
 *   URL                             (título fica para o usuário preencher)
 *   Nome da música                  (sem link)
 * Não faz scraping de nenhum serviço: apenas valida o formato da URL.
 */
export interface ImportRow {
  line: number;
  raw: string;
  title: string;
  artist: string | null;
  url: string | null;
  errors: string[];
  duplicateOf: "existing" | "batch" | null;
}

const URL_RE = /https?:\/\/[^\s|;,]+/i;

export function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return (u.protocol === "http:" || u.protocol === "https:") && !!u.hostname && u.hostname.includes(".");
  } catch {
    return false;
  }
}

export function normalizeTitle(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function parseSongImport(text: string, existingTitles: string[] = [], existingUrls: string[] = []): ImportRow[] {
  const existingT = new Set(existingTitles.map(normalizeTitle));
  const existingU = new Set(existingUrls.filter(Boolean).map((u) => u.trim().toLowerCase()));
  const batchT = new Set<string>();
  const batchU = new Set<string>();
  const rows: ImportRow[] = [];

  text.split(/\r?\n/).forEach((rawLine, idx) => {
    const raw = rawLine.trim();
    if (!raw || raw.startsWith("#")) return;
    // Cabeçalho CSV comum
    if (idx === 0 && /^(t[ií]tulo|nome|title)\s*[|;,]/i.test(raw)) return;

    let parts: string[];
    if (raw.includes("|")) parts = raw.split("|");
    else if (raw.includes(";")) parts = raw.split(";");
    else if (raw.includes(",") && URL_RE.test(raw)) parts = raw.split(",");
    else parts = [raw];
    parts = parts.map((p) => p.trim()).filter(Boolean);

    // Também reconhece links malformados (htps:/, www., ://) para sinalizá-los como inválidos
    // em vez de confundi-los com o nome do artista.
    const urlIdx = parts.findIndex((p) => /^https?:\/\//i.test(p) || /^(h?t?tps?:\/|www\.)/i.test(p) || /^[a-z]+:\/\//i.test(p));
    const url = urlIdx >= 0 ? parts[urlIdx] : null;
    const textParts = parts.filter((_, i) => i !== urlIdx);
    const title = textParts[0] ?? "";
    const artist = textParts[1] ?? null;
    const errors: string[] = [];
    if (!title) errors.push("Informe o nome da música.");
    if (title.length > 160) errors.push("Nome muito longo (máx. 160 caracteres).");
    if (url && !isValidHttpUrl(url)) errors.push("Link inválido. Use um endereço começando com https://");
    if (!url && /^(www\.|[a-z0-9-]+\.(com|be|br|net)\b)/i.test(title)) errors.push("Parece um link sem https:// no início.");

    const nt = normalizeTitle(title);
    const nu = url?.toLowerCase() ?? "";
    let duplicateOf: ImportRow["duplicateOf"] = null;
    if ((nt && existingT.has(nt)) || (nu && existingU.has(nu))) duplicateOf = "existing";
    else if ((nt && batchT.has(nt)) || (nu && batchU.has(nu))) duplicateOf = "batch";
    if (nt) batchT.add(nt);
    if (nu) batchU.add(nu);

    rows.push({ line: idx + 1, raw, title, artist, url, errors, duplicateOf });
  });
  return rows;
}

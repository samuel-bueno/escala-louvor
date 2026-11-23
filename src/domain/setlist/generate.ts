/**
 * Gerador de repertório.
 *
 * Considera: somente músicas ativas · não bloqueadas · obrigatórias primeiro ·
 * categorias pedidas (na ordem informada = fluxo do culto) · intervalo mínimo desde
 * a última execução · quantidade de execuções · tema · dificuldade máxima.
 *
 * Aleatoriedade controlada: as candidatas são ordenadas por "frescor" (há quanto
 * tempo não tocamos + quantas vezes tocamos) e a escolha é sorteada apenas entre
 * as melhores. Se faltar música, devolve resultado PARCIAL com aviso — nunca
 * inventa. O intervalo pode ser flexibilizado explicitamente (relaxInterval).
 */
import { diffDays, type CivilDate } from "../dates";
import type { Rng } from "../random";
import { plural } from "@/lib/plural";

export interface SetlistSong {
  id: string;
  title: string;
  active: boolean;
  categoryId: string | null;
  theme?: string | null;
  tags?: string[];
  difficulty?: number | null;
  durationSec?: number | null;
  /** Datas em que a música foi executada (histórico). */
  plays: CivilDate[];
}

export interface SetlistRequest {
  date: CivilDate;
  total: number;
  /** Quantidade por categoria, na ordem do culto. */
  categories?: { categoryId: string; count: number }[];
  requiredIds?: string[];
  blockedIds?: string[];
  minIntervalDays: number;
  maxDifficulty?: number | null;
  /** Duração aproximada desejada, em minutos (apenas aviso). */
  targetMinutes?: number | null;
  themes?: string[];
  /** Permite usar músicas recentes quando faltar opção (marcadas como "flexibilizada"). */
  relaxInterval?: boolean;
  rng: Rng;
  categoryNames?: Record<string, string>;
}

export interface SetlistPick {
  songId: string;
  categoryId: string | null;
  reason: string;
  required: boolean;
  relaxed: boolean;
}

export interface SetlistResult {
  items: SetlistPick[];
  warnings: string[];
  requested: number;
}

interface Scored {
  song: SetlistSong;
  score: number;
  daysSince: number | null;
  recent: boolean;
}

function lastPlayBefore(song: SetlistSong, date: CivilDate): number | null {
  let best: number | null = null;
  for (const p of song.plays) {
    const d = diffDays(date, p);
    if (d < 0) continue; // execução futura (agendada) não conta como "última"
    if (best === null || d < best) best = d;
  }
  return best;
}

function score(song: SetlistSong, req: SetlistRequest): Scored {
  const daysSince = lastPlayBefore(song, req.date);
  // Também considera execuções agendadas no futuro próximo (evita repetir em sequência).
  const nearFuture = song.plays.some((p) => {
    const d = diffDays(p, req.date);
    return d > 0 && d < req.minIntervalDays;
  });
  const recent = (daysSince !== null && daysSince < req.minIntervalDays) || nearFuture;
  let s = 0;
  s += daysSince === null ? -40 : -Math.min(daysSince, 120) / 3; // mais tempo sem tocar = melhor
  s += song.plays.length * 1.5; // menos execuções = melhor
  if (req.themes?.length) {
    const hay = [song.theme ?? "", ...(song.tags ?? [])].join(" ").toLowerCase();
    if (req.themes.some((t) => t && hay.includes(t.toLowerCase()))) s -= 25;
  }
  return { song, score: s, daysSince, recent };
}

function describe(sc: Scored, relaxed: boolean): string {
  const parts: string[] = [];
  if (sc.daysSince === null) parts.push("nunca executada ou sem histórico");
  else parts.push(`última execução há ${sc.daysSince} dias`);
  parts.push(`${sc.song.plays.length} ${plural(sc.song.plays.length, "execução", "execuções")}`);
  if (relaxed) parts.push("intervalo mínimo flexibilizado");
  return parts.join(" · ");
}

/** Sorteia entre as melhores candidatas (top 30%, mínimo 3). */
function pickBest(cands: Scored[], rng: Rng): Scored {
  const sorted = [...cands].sort((a, b) => a.score - b.score);
  const k = Math.min(sorted.length, Math.max(3, Math.ceil(sorted.length * 0.3)));
  return sorted[Math.floor(rng() * k)];
}

export function generateSetlist(songs: SetlistSong[], req: SetlistRequest): SetlistResult {
  const catName = (id: string | null) => (id ? (req.categoryNames?.[id] ?? "Categoria") : "Sem categoria");
  const used = new Set<string>();
  const items: SetlistPick[] = [];
  const warnings: string[] = [];
  const blocked = new Set(req.blockedIds ?? []);
  const byId = new Map(songs.map((s) => [s.id, s]));

  // 1) Obrigatórias (escolha humana — entram mesmo se recentes; aviso se inativas).
  for (const id of req.requiredIds ?? []) {
    const s = byId.get(id);
    if (!s || used.has(id)) continue;
    if (!s.active) warnings.push(`"${s.title}" está inativa, mas foi mantida por ser obrigatória.`);
    used.add(id);
    items.push({ songId: id, categoryId: s.categoryId, reason: "Música obrigatória definida pelo usuário.", required: true, relaxed: false });
  }

  const pool = songs.filter(
    (s) => s.active && !blocked.has(s.id) && (req.maxDifficulty == null || s.difficulty == null || s.difficulty <= req.maxDifficulty),
  );

  const fill = (count: number, filter: (s: SetlistSong) => boolean, label: string) => {
    let need = count;
    const cands = () => pool.filter((s) => !used.has(s.id) && filter(s)).map((s) => score(s, req));
    let fresh = cands().filter((c) => !c.recent);
    while (need > 0 && fresh.length > 0) {
      const c = pickBest(fresh, req.rng);
      used.add(c.song.id);
      items.push({ songId: c.song.id, categoryId: c.song.categoryId, reason: describe(c, false), required: false, relaxed: false });
      fresh = fresh.filter((f) => f.song.id !== c.song.id);
      need--;
    }
    if (need > 0) {
      const recent = cands()
        .filter((c) => c.recent)
        .sort((a, b) => (b.daysSince ?? 0) - (a.daysSince ?? 0));
      if (req.relaxInterval && recent.length > 0) {
        const take = recent.slice(0, need);
        for (const c of take) {
          used.add(c.song.id);
          items.push({ songId: c.song.id, categoryId: c.song.categoryId, reason: describe(c, true), required: false, relaxed: true });
        }
        need -= take.length;
        warnings.push(`${label}: ${take.length} ${plural(take.length, "música", "músicas")} usadas com intervalo menor que ${req.minIntervalDays} dias (regra flexibilizada).`);
      }
      if (need > 0) {
        warnings.push(
          `${label}: não existem músicas elegíveis suficientes para cumprir o intervalo de ${req.minIntervalDays} dias. Foram encontradas apenas ${count - need} de ${count}.` +
            (recent.length > 0 && !req.relaxInterval ? ` Há ${recent.length} ${plural(recent.length, "música", "músicas")} tocadas recentemente que podem ser usadas se você flexibilizar o intervalo.` : ""),
        );
      }
    }
  };

  // 2) Por categoria, descontando obrigatórias já incluídas daquela categoria.
  for (const { categoryId, count } of req.categories ?? []) {
    const already = items.filter((i) => i.required && i.categoryId === categoryId).length;
    if (count - already > 0) fill(count - already, (s) => s.categoryId === categoryId, catName(categoryId));
  }

  // 3) Completa o total com qualquer categoria.
  const remaining = req.total - items.length;
  if (remaining > 0) fill(remaining, () => true, "Repertório");

  // 4) Ordem do culto: segue a ordem das categorias pedidas; obrigatórias no lugar da categoria.
  const catOrder = new Map((req.categories ?? []).map((c, i) => [c.categoryId, i]));
  const ordered = items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => (catOrder.get(a.it.categoryId ?? "") ?? 99) - (catOrder.get(b.it.categoryId ?? "") ?? 99) || a.i - b.i)
    .map((x) => x.it);

  if (ordered.length < req.total && !warnings.some((w) => w.includes("Foram encontradas")))
    warnings.push(`Foram encontradas apenas ${ordered.length} de ${req.total} músicas.`);

  if (req.targetMinutes) {
    const secs = ordered.reduce((sum, it) => sum + (byId.get(it.songId)?.durationSec ?? 0), 0);
    const known = ordered.every((it) => byId.get(it.songId)?.durationSec);
    if (known && Math.abs(secs / 60 - req.targetMinutes) > req.targetMinutes * 0.2)
      warnings.push(`Duração estimada de ${Math.round(secs / 60)} min (desejado: ~${req.targetMinutes} min).`);
  }

  return { items: ordered, warnings, requested: req.total };
}

/**
 * Repertórios para vários cultos de uma vez (preparado para uso futuro):
 * cada escolha entra no histórico antes de gerar o próximo, espalhando as músicas.
 */
export function generateSetlistsForPeriod(
  dates: CivilDate[],
  songs: SetlistSong[],
  base: Omit<SetlistRequest, "date">,
): { date: CivilDate; result: SetlistResult }[] {
  const working = songs.map((s) => ({ ...s, plays: [...s.plays] }));
  const byId = new Map(working.map((s) => [s.id, s]));
  return [...dates].sort().map((date) => {
    const result = generateSetlist(working, { ...base, date });
    for (const it of result.items) byId.get(it.songId)?.plays.push(date);
    return { date, result };
  });
}

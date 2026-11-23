/**
 * Geração automática de escalas — "aleatoriedade inteligente".
 *
 * Não é sorteio puro. Para cada posição:
 *  1. Filtros obrigatórios (eliminam candidatos, com motivo explicável):
 *     ativo · não excluído · possui a função/instrumento · disponível na data ·
 *     não está em outra posição do mesmo compromisso · sem conflito de horário ·
 *     limite mensal (quando obrigatório) · máximo por pessoa no lote.
 *  2. Pontuação (menor = melhor) entre os que sobraram:
 *     participações no mês · participações no lote · proximidade da última
 *     participação · culto consecutivo · limite como preferência · função
 *     principal · dias habituais.
 *  3. Sorteio controlado apenas entre candidatos EQUIVALENTES (pontuação empatada).
 *
 * Os eventos do lote são processados em ordem cronológica e as contagens são
 * acumuladas, o que espalha as pessoas pelo período inteiro (sem concentrar no
 * começo). Dentro de um compromisso, posições com menos candidatos são resolvidas
 * primeiro (ex.: o único baterista não é "gasto" na guitarra).
 *
 * Função pura: não acessa banco nem UI. Nada é salvo aqui — o resultado é uma
 * PRÉVIA que o administrador revisa antes de aplicar.
 */
import { diffDays, formatDayMonth, formatMonthYear, monthKey, timesOverlap, weekday } from "../dates";
import type {
  Assignment,
  DistributionRules,
  GenerateOptions,
  GenerationResult,
  Proposal,
  Rejection,
  SchedEvent,
  SchedParticipant,
  SchedSlot,
} from "./types";
import { plural } from "@/lib/plural";

const TIE_EPSILON = 0.5;

interface Ctx {
  participants: SchedParticipant[];
  rules: DistributionRules;
  options: GenerateOptions;
  assigned: Assignment[];
  batchCounts: Map<string, number>;
  fnName: (id: string) => string;
}

export function isUnavailableOn(p: SchedParticipant, date: string): boolean {
  return p.unavailable.some((r) => r.start <= date && date <= r.end);
}

export function monthlyLimitOf(p: SchedParticipant, rules: DistributionRules): number {
  return p.monthlyLimit ?? rules.defaultMonthlyLimit;
}

function monthCount(assigned: Assignment[], pid: string, month: string, exceptEventId?: string): number {
  const eventIds = new Set<string>();
  for (const a of assigned) {
    if (a.participantId === pid && monthKey(a.date) === month && a.eventId !== exceptEventId) eventIds.add(a.eventId);
  }
  return eventIds.size;
}

function nearestDistance(assigned: Assignment[], pid: string, date: string, exceptEventId: string): number | null {
  let best: number | null = null;
  for (const a of assigned) {
    if (a.participantId !== pid || a.eventId === exceptEventId) continue;
    const d = Math.abs(diffDays(date, a.date));
    if (best === null || d < best) best = d;
  }
  return best;
}

function lastBefore(assigned: Assignment[], pid: string, date: string): number | null {
  let best: number | null = null;
  for (const a of assigned) {
    if (a.participantId !== pid || a.date >= date) continue;
    const d = diffDays(date, a.date);
    if (best === null || d < best) best = d;
  }
  return best;
}

/** Verifica filtros obrigatórios. Retorna o motivo da eliminação ou null. */
function hardReject(ctx: Ctx, p: SchedParticipant, ev: SchedEvent, slot: SchedSlot): string | null {
  const { options, rules, assigned } = ctx;
  if (!p.active) return "inativo";
  if (options.excludedIds?.includes(p.id)) return "excluído desta geração pelo administrador";
  if (options.eligibleIds && !options.eligibleIds.includes(p.id)) return "fora da lista de elegíveis";
  if (!p.functionIds.includes(slot.functionId)) return `não tem ${ctx.fnName(slot.functionId)} cadastrado`;
  if (isUnavailableOn(p, ev.date)) return "indisponível nesta data";
  const sameEvent = assigned.find((a) => a.participantId === p.id && a.eventId === ev.id);
  if (sameEvent) return `já está escalado neste compromisso (${ctx.fnName(sameEvent.functionId)})`;
  const clash = assigned.find(
    (a) => a.participantId === p.id && a.date === ev.date && a.eventId !== ev.id && timesOverlap(a.startTime, a.endTime, ev.startTime, ev.endTime),
  );
  if (clash) return `conflito de horário com "${clash.eventTitle}"`;
  const limit = monthlyLimitOf(p, rules);
  const count = monthCount(assigned, p.id, monthKey(ev.date), ev.id);
  if (rules.limitMode === "hard" && count >= limit) return `limite mensal atingido (${count}/${limit})`;
  if (options.maxPerPerson !== undefined && (ctx.batchCounts.get(p.id) ?? 0) >= options.maxPerPerson)
    return `atingiu o máximo de ${options.maxPerPerson} no período`;
  return null;
}

interface Scored {
  p: SchedParticipant;
  score: number;
  factors: string[];
}

function scoreCandidate(ctx: Ctx, p: SchedParticipant, ev: SchedEvent, slot: SchedSlot, prevEvent: SchedEvent | undefined): Scored {
  const { rules, assigned } = ctx;
  const month = monthKey(ev.date);
  const mCount = monthCount(assigned, p.id, month, ev.id);
  const bCount = ctx.batchCounts.get(p.id) ?? 0;
  const near = nearestDistance(assigned, p.id, ev.date, ev.id);
  const since = lastBefore(assigned, p.id, ev.date);
  const factors: string[] = [];
  let score = 0;

  score += mCount * (rules.prioritizeLess ? 10 : 4);
  score += bCount * 6;
  factors.push(mCount === 0 ? `nenhuma participação em ${formatMonthYear(month).split(" ")[0]}` : `${mCount} ${plural(mCount, "participação", "participações")} em ${formatMonthYear(month).split(" ")[0]}`);

  const inPrev = prevEvent ? assigned.some((a) => a.participantId === p.id && a.eventId === prevEvent.id) : false;
  if (rules.avoidConsecutive && inPrev) {
    score += 30;
    factors.push("serviu no compromisso anterior");
  }
  if (near !== null && near < rules.minIntervalDays) {
    score += 15 * (1 - near / Math.max(rules.minIntervalDays, 1));
    factors.push(`intervalo curto (${near} ${plural(near, "dia", "dias")})`);
  }
  if (since !== null) {
    score -= Math.min(since, 60) / 10;
    if (since >= rules.minIntervalDays) factors.push(`última participação há ${since} dias`);
  } else if (near === null) {
    score -= 6;
    factors.push("ainda não serviu no período");
  }

  const limit = monthlyLimitOf(p, rules);
  if (rules.limitMode === "soft" && mCount >= limit) {
    score += 40;
    factors.push(`acima do limite mensal (${mCount}/${limit}, preferência)`);
  }
  if (p.primaryFunctionId === slot.functionId) {
    score -= 2;
    factors.push("instrumento principal");
  } else if (p.primaryFunctionId) {
    score += 2;
  }
  if (p.usualDays.length > 0 && !p.usualDays.includes(weekday(ev.date))) {
    score += 5;
    factors.push("fora dos dias habituais");
  }
  return { p, score, factors };
}

export function generateSchedule(
  events: SchedEvent[],
  participants: SchedParticipant[],
  history: Assignment[],
  rules: DistributionRules,
  options: GenerateOptions,
): GenerationResult {
  const names = options.functionNames ?? {};
  const ctx: Ctx = {
    participants,
    rules,
    options,
    assigned: history.filter((h) => !events.some((e) => e.id === h.eventId)),
    batchCounts: new Map(),
    fnName: (id) => names[id] ?? "a função",
  };
  const sorted = [...events].sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  const inScope = (s: SchedSlot) => !options.functionIds || options.functionIds.includes(s.functionId);
  const proposals: Proposal[] = [];
  const warnings: string[] = [];

  const record = (ev: SchedEvent, slot: SchedSlot, pid: string) => {
    ctx.assigned.push({ eventId: ev.id, eventTitle: ev.title, participantId: pid, functionId: slot.functionId, date: ev.date, startTime: ev.startTime, endTime: ev.endTime });
    ctx.batchCounts.set(pid, (ctx.batchCounts.get(pid) ?? 0) + 1);
  };

  // 1) Posições mantidas contam desde o início (para conflitos e equilíbrio).
  const toFill: { ev: SchedEvent; slot: SchedSlot }[] = [];
  for (const ev of sorted) {
    for (const slot of ev.slots) {
      const keep = ev.locked || slot.locked || !inScope(slot) || (options.mode === "fill-empty" && slot.participantId !== null);
      if (keep) {
        if (slot.participantId) record(ev, slot, slot.participantId);
        proposals.push({
          eventId: ev.id,
          slotId: slot.id,
          functionId: slot.functionId,
          previousParticipantId: slot.participantId,
          participantId: slot.participantId,
          source: "fixed",
          reason: slot.locked || ev.locked ? "Fixado manualmente — não é alterado pela geração." : !inScope(slot) ? "Fora do escopo desta geração." : "Mantido: posição já estava preenchida.",
          rejected: [],
          candidates: 0,
        });
      } else {
        toFill.push({ ev, slot });
      }
    }
  }

  // 2) Preenche evento a evento, em ordem cronológica.
  for (let i = 0; i < sorted.length; i++) {
    const ev = sorted[i];
    const prev = i > 0 ? sorted[i - 1] : undefined;
    const pending = toFill.filter((t) => t.ev.id === ev.id);
    // Escassez primeiro: posições com menos candidatos válidos são resolvidas antes.
    const withCount = pending.map((t) => ({
      ...t,
      n: participants.filter((p) => hardReject(ctx, p, ev, t.slot) === null).length,
    }));
    withCount.sort((a, b) => a.n - b.n || (a.slot.sortOrder ?? 0) - (b.slot.sortOrder ?? 0));

    for (const { slot } of withCount) {
      const rejected: Rejection[] = [];
      const valid: SchedParticipant[] = [];
      for (const p of participants) {
        const r = hardReject(ctx, p, ev, slot);
        if (r === null) valid.push(p);
        // Só lista rejeitados que têm a função (o resto é ruído para o admin).
        else if (p.functionIds.includes(slot.functionId) || slot.participantId === p.id) rejected.push({ participantId: p.id, name: p.name, reason: r });
      }

      if (valid.length === 0) {
        const fn = ctx.fnName(slot.functionId);
        proposals.push({
          eventId: ev.id,
          slotId: slot.id,
          functionId: slot.functionId,
          previousParticipantId: slot.participantId,
          participantId: null,
          source: "empty",
          reason: `${fn}: nenhum participante elegível encontrado.`,
          rejected,
          candidates: 0,
        });
        if (slot.required !== false) warnings.push(`${formatDayMonth(ev.date)} • ${fn}: nenhum participante elegível encontrado.`);
        continue;
      }

      const scored = valid.map((p) => scoreCandidate(ctx, p, ev, slot, prev)).sort((a, b) => a.score - b.score);
      const best = scored[0].score;
      const ties = scored.filter((s) => s.score - best <= TIE_EPSILON);
      const chosen = ties[Math.floor(options.rng() * ties.length)];
      record(ev, slot, chosen.p.id);

      let reason = `${chosen.p.name}: disponível · ${chosen.factors.join(" · ")}.`;
      if (scored.length > 1) {
        reason += ties.length > 1 ? ` Desempate aleatório entre ${ties.length} candidatos equivalentes.` : ` Melhor equilíbrio entre ${scored.length} candidatos.`;
      } else {
        reason += " Único candidato elegível.";
      }
      for (const s of scored) {
        if (s.p.id !== chosen.p.id) rejected.push({ participantId: s.p.id, name: s.p.name, reason: `elegível, mas com prioridade menor (${s.factors[0]})` });
      }
      proposals.push({
        eventId: ev.id,
        slotId: slot.id,
        functionId: slot.functionId,
        previousParticipantId: slot.participantId,
        participantId: chosen.p.id,
        source: "generated",
        reason,
        rejected,
        candidates: scored.length,
      });
    }
  }

  // Ordem estável para exibição: evento cronológico, depois ordem da posição.
  const order = new Map<string, number>();
  sorted.forEach((ev, i) => ev.slots.forEach((s, j) => order.set(s.id, i * 1000 + (s.sortOrder ?? j))));
  proposals.sort((a, b) => (order.get(a.slotId) ?? 0) - (order.get(b.slotId) ?? 0));

  return { proposals, warnings, counts: Object.fromEntries(ctx.batchCounts) };
}

/**
 * Recorrência simples e previsível:
 *  - toda semana em um dia (nthOfMonth = null)
 *  - n-ésimo dia da semana do mês (1..5) ou último (-1)
 */
import { addDays, endOfMonth, weekday, type CivilDate } from "./dates";

export interface RecurrencePattern {
  weekday: number;
  nthOfMonth: number | null;
}

export function occurrences(rule: RecurrencePattern, start: CivilDate, end: CivilDate): CivilDate[] {
  const out: CivilDate[] = [];
  let d = start;
  while (weekday(d) !== rule.weekday) d = addDays(d, 1);
  for (; d <= end; d = addDays(d, 7)) {
    if (rule.nthOfMonth == null) out.push(d);
    else if (matchesNth(d, rule.nthOfMonth)) out.push(d);
  }
  return out;
}

function matchesNth(d: CivilDate, nth: number): boolean {
  if (nth === -1) return addDays(d, 7) > endOfMonth(d);
  const dayOfMonth = Number(d.slice(8, 10));
  return Math.ceil(dayOfMonth / 7) === nth;
}

export function describeRecurrence(rule: RecurrencePattern): string {
  const days = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  const name = days[rule.weekday];
  const plural = rule.weekday === 0 || rule.weekday === 6 ? "Todo" : "Toda";
  if (rule.nthOfMonth == null) return `${plural} ${name}`;
  if (rule.nthOfMonth === -1) return `${rule.weekday === 0 || rule.weekday === 6 ? "Último" : "Última"} ${name} do mês`;
  const ord = rule.weekday === 0 || rule.weekday === 6 ? `${rule.nthOfMonth}º` : `${rule.nthOfMonth}ª`;
  return `${ord} ${name} do mês`;
}

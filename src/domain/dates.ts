/**
 * Datas civis ("YYYY-MM-DD") sem conversão de fuso.
 *
 * Estratégia: o dia de um culto é uma DATA CIVIL, não um instante. Ela é guardada
 * como texto e toda aritmética é feita em UTC puro sobre esse texto — portanto um
 * domingo nunca vira sábado por causa de fuso. O fuso (America/Sao_Paulo) só é
 * usado para descobrir "que dia é hoje" na igreja e para instantes (timestamps).
 */
export type CivilDate = string; // YYYY-MM-DD

export const DEFAULT_TIMEZONE = "America/Sao_Paulo";

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = toUTC(value);
  return d.toISOString().slice(0, 10) === value;
}

export function isValidTime(value: string): boolean {
  return TIME_RE.test(value);
}

function toUTC(date: CivilDate): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUTC(d: Date): CivilDate {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: CivilDate, days: number): CivilDate {
  const d = toUTC(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUTC(d);
}

export function addMonths(date: CivilDate, months: number): CivilDate {
  const [y, m] = date.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return fromUTC(d);
}

/** 0 = domingo … 6 = sábado */
export function weekday(date: CivilDate): number {
  return toUTC(date).getUTCDay();
}

export function diffDays(a: CivilDate, b: CivilDate): number {
  return Math.round((toUTC(a).getTime() - toUTC(b).getTime()) / 86_400_000);
}

export function monthKey(date: CivilDate): string {
  return date.slice(0, 7);
}

export function startOfMonth(date: CivilDate): CivilDate {
  return `${date.slice(0, 7)}-01`;
}

export function endOfMonth(date: CivilDate): CivilDate {
  return addDays(addMonths(startOfMonth(date), 1), -1);
}

export function daysInRange(start: CivilDate, end: CivilDate): CivilDate[] {
  const out: CivilDate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** "Hoje" na igreja, respeitando o fuso configurado. */
export function todayIn(timeZone = DEFAULT_TIMEZONE, now = new Date()): CivilDate {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Converte "HH:mm" em minutos. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Intervalos [início, fim) se sobrepõem? Sem horário de término assume 2h. */
export function timesOverlap(aStart: string, aEnd: string | null | undefined, bStart: string, bEnd: string | null | undefined): boolean {
  const as = timeToMinutes(aStart);
  const ae = aEnd ? timeToMinutes(aEnd) : as + 120;
  const bs = timeToMinutes(bStart);
  const be = bEnd ? timeToMinutes(bEnd) : bs + 120;
  return as < be && bs < ae;
}

// ---------------------------------------------------------------------------
// Formatação pt-BR (sem fuso: a data civil é formatada em UTC propositalmente)
// ---------------------------------------------------------------------------
const WEEKDAYS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const WEEKDAYS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export const weekdayName = (d: CivilDate) => WEEKDAYS[weekday(d)];
export const weekdayShort = (d: CivilDate) => WEEKDAYS_SHORT[weekday(d)];
export const WEEKDAY_NAMES = WEEKDAYS;
export const WEEKDAY_SHORT_NAMES = WEEKDAYS_SHORT;

/** 15/11/2026 */
export function formatDate(d: CivilDate): string {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

/** 15/11 */
export function formatDayMonth(d: CivilDate): string {
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}

/** 15 de novembro */
export function formatLong(d: CivilDate): string {
  const [, m, day] = d.split("-").map(Number);
  return `${day} de ${MONTHS[m - 1]}`;
}

export function monthDay(d: CivilDate): { day: string; month: string } {
  const [, m, day] = d.split("-").map(Number);
  return { day: String(day).padStart(2, "0"), month: MONTHS_SHORT[m - 1] };
}

/** novembro de 2026 */
export function formatMonthYear(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS[m - 1]} de ${y}`;
}

/** Instante → "16/11/2026 às 14:05" no fuso da igreja. */
export function formatInstant(date: Date, timeZone = DEFAULT_TIMEZONE): string {
  const f = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => f.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} às ${get("hour")}:${get("minute")}`;
}

/** "Hoje", "Amanhã", "Em 5 dias", "Há 3 dias" */
export function relativeDay(d: CivilDate, today: CivilDate): string {
  const n = diffDays(d, today);
  if (n === 0) return "Hoje";
  if (n === 1) return "Amanhã";
  if (n === -1) return "Ontem";
  if (n > 1) return `Em ${n} dias`;
  return `Há ${-n} dias`;
}

/** "agora há pouco", "há 10 min", "há 3 h", "há 2 dias" (instante → relativo). */
export function ago(date: Date, now = new Date()): string {
  const min = Math.max(0, Math.round((now.getTime() - date.getTime()) / 60_000));
  if (min < 1) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return `há ${d} ${d === 1 ? "dia" : "dias"}`;
}

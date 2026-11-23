/**
 * Schemas Zod compartilhados entre cliente e servidor.
 * O servidor SEMPRE revalida — o cliente só usa para feedback rápido.
 */
import { z } from "zod";
import { isValidDate, isValidTime } from "@/domain/dates";
import { isValidHttpUrl } from "@/domain/song-import";

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres.`)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

const civilDate = z.string().refine(isValidDate, "Data inválida.");
const optDate = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || isValidDate(v), "Data inválida.");
const time = z.string().refine(isValidTime, "Horário inválido (use HH:mm).");
const optTime = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || isValidTime(v), "Horário inválido (use HH:mm).");
const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("false"), z.literal(""), z.boolean()])
  .optional()
  .transform((v) => v === true || v === "on" || v === "true");
const optInt = (min: number, max: number, msg: string) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v === "" || v === undefined || v === null ? null : Number(v)))
    .refine((v) => v === null || (Number.isInteger(v) && v >= min && v <= max), msg);
const optUrl = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || isValidHttpUrl(v), "Link inválido. Use um endereço começando com https://");

export const EVENT_TYPE_LABELS = {
  culto: "Culto",
  ensaio: "Ensaio",
  evento: "Evento",
  conferencia: "Conferência",
  culto_especial: "Culto especial",
} as const;

export const EVENT_STATUS_LABELS = {
  draft: "Rascunho",
  pending: "Aguardando confirmação",
  published: "Publicado",
  completed: "Concluído",
  cancelled: "Cancelado",
} as const;

export const FUNCTION_KIND_LABELS = {
  minister: "Ministração",
  vocal: "Voz",
  instrument: "Instrumento",
  tech: "Técnica",
} as const;

export const LEVEL_LABELS = { iniciante: "Iniciante", intermediario: "Intermediário", avancado: "Avançado" } as const;

export const participantSchema = z.object({
  fullName: z.string().trim().min(2, "Informe o nome completo.").max(120, "Nome muito longo."),
  displayName: z.string().trim().max(40, "Use no máximo 40 caracteres.").optional().default(""),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || z.email().safeParse(v).success, "E-mail inválido."),
  phone: optText(30),
  level: z
    .enum(["", "iniciante", "intermediario", "avancado"])
    .optional()
    .transform((v) => (v ? v : null)),
  monthlyLimit: optInt(0, 31, "Informe um número entre 0 e 31."),
  notes: optText(1000),
  active: checkbox,
  usualDays: z.array(z.coerce.number().int().min(0).max(6)).default([]),
  functionIds: z.array(z.string().min(1)).default([]),
  primaryFunctionId: z
    .string()
    .optional()
    .transform((v) => (v ? v : null)),
  // Acesso ao app (opcional)
  createAccess: checkbox,
  password: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || v.length >= 8, "A senha precisa ter pelo menos 8 caracteres."),
  /** Papel no sistema (≠ função musical): membro, líder dos músicos, líder dos vocais, ambos ou administrador. */
  role: z.enum(["member", "lead_instrumental", "lead_vocal", "lead_both", "admin"]).optional().default("member"),
});
export type ParticipantInput = z.infer<typeof participantSchema>;

export const unavailabilitySchema = z
  .object({
    participantId: z.string().min(1),
    startDate: civilDate,
    endDate: optDate,
    reason: optText(200),
  })
  .transform((v) => ({ ...v, endDate: v.endDate ?? v.startDate }))
  .refine((v) => v.endDate >= v.startDate, { message: "A data final precisa ser igual ou posterior à data inicial.", path: ["endDate"] });

export const eventSchema = z
  .object({
    title: z.string().trim().min(2, "Informe o título.").max(100, "Título muito longo."),
    type: z.enum(["culto", "ensaio", "evento", "conferencia", "culto_especial"]),
    date: civilDate,
    startTime: time,
    endTime: optTime,
    location: optText(120),
    theme: optText(120),
    notes: optText(2000),
    confirmDeadline: optDate,
    positions: z
      .array(z.object({ functionId: z.string().min(1), count: z.coerce.number().int().min(0, "Quantidade não pode ser negativa.").max(10) }))
      .default([]),
    rehearsalId: z
      .string()
      .optional()
      .transform((v) => (v ? v : null)),
    /** Recorrência opcional (só na criação). */
    repeat: z.enum(["none", "weekly", "monthly"]).optional().default("none"),
    repeatUntil: optDate,
  })
  .refine((v) => !v.endTime || v.endTime > v.startTime, { message: "O término deve ser depois do início.", path: ["endTime"] })
  .refine((v) => v.repeat === "none" || (v.repeatUntil !== null && v.repeatUntil > v.date), { message: "Informe até quando repetir (depois da primeira data).", path: ["repeatUntil"] })
  .refine((v) => v.repeat === "none" || v.repeatUntil === null || v.repeatUntil <= "2030-12-31", { message: "Escolha uma data até 2030.", path: ["repeatUntil"] })
  .refine((v) => !v.confirmDeadline || v.confirmDeadline <= v.date, { message: "O prazo deve ser até a data do compromisso.", path: ["confirmDeadline"] });
export type EventInput = z.infer<typeof eventSchema>;

/** "4:30" ou "270" (segundos) → segundos */
export function parseDuration(v: string | null | undefined): number | null {
  if (!v) return null;
  const s = v.trim();
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(s);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  if (/^\d+$/.test(s)) return Number(s);
  return NaN;
}

export function formatDuration(sec: number | null | undefined): string {
  if (!sec) return "";
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

export const songSchema = z.object({
  title: z.string().trim().min(1, "Informe o título.").max(160, "Título muito longo."),
  artist: optText(120),
  originalKey: optText(8),
  bpm: optInt(20, 300, "BPM entre 20 e 300."),
  duration: z
    .string()
    .optional()
    .transform((v) => parseDuration(v))
    .refine((v) => v === null || (Number.isFinite(v) && v > 0 && v < 3600), "Use o formato minutos:segundos, ex.: 4:30."),
  url: optUrl,
  categoryId: z
    .string()
    .optional()
    .transform((v) => (v ? v : null)),
  theme: optText(80),
  tags: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 12),
    ),
  difficulty: optInt(1, 3, "Dificuldade inválida."),
  active: checkbox,
  notes: optText(1000),
  extraLinks: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? "")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean),
    )
    .refine((arr) => arr.every((l) => isValidHttpUrl(l.split("|").pop()!.trim())), "Cada link adicional precisa começar com https://"),
});
export type SongInput = z.infer<typeof songSchema>;

export const functionSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(40, "Nome muito longo."),
  kind: z.enum(["minister", "vocal", "instrument", "tech"]),
});

export const settingsSchema = z.object({
  avoidConsecutive: checkbox,
  defaultMonthlyLimit: z.coerce.number().int().min(1, "Mínimo 1.").max(31, "Máximo 31."),
  limitMode: z.enum(["hard", "soft"]),
  minIntervalDays: z.coerce.number().int().min(0, "Não pode ser negativo.").max(60, "Máximo 60 dias."),
  prioritizeLess: checkbox,
  songMinIntervalDays: z.coerce.number().int().min(0, "Não pode ser negativo.").max(365, "Máximo 365 dias."),
  defaultSongCount: z.coerce.number().int().min(1, "Mínimo 1.").max(15, "Máximo 15."),
});

export const recurrenceSchema = z.object({
  title: z.string().trim().min(2, "Informe o título.").max(100),
  type: z.enum(["culto", "ensaio", "evento", "conferencia", "culto_especial"]),
  weekday: z.coerce.number().int().min(0).max(6),
  nthOfMonth: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .refine((v) => v === null || [1, 2, 3, 4, 5, -1].includes(v), "Opção inválida."),
  startTime: time,
  endTime: optTime,
  location: optText(120),
});

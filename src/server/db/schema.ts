/**
 * Schema do banco (Drizzle + SQLite/libSQL).
 *
 * Convenções:
 * - IDs são UUIDs aleatórios (não previsíveis).
 * - Datas civis (dia do culto) são TEXT "YYYY-MM-DD"; horários são TEXT "HH:mm".
 *   Nunca convertemos a data civil para UTC — o fuso fica em organizations.timezone.
 * - Instantes (criado em, respondido em) são INTEGER em milissegundos (UTC).
 * - Toda entidade de negócio carrega organization_id (preparado para multi-igreja).
 * - Nada calculável é armazenado de forma redundante: "última escala", "total de
 *   participações" e "última execução da música" são derivados das tabelas de fatos.
 */
import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);
const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`)
    .$onUpdateFn(() => new Date());
const orgId = () =>
  text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" });

// ---------------------------------------------------------------------------
// Organização (igreja) e configurações
// ---------------------------------------------------------------------------
export const organizations = sqliteTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  timezone: text("timezone").notNull().default("America/Sao_Paulo"),
  locale: text("locale").notNull().default("pt-BR"),
  createdAt: createdAt(),
});

/** Regras de distribuição. Uma linha por organização. */
export const orgSettings = sqliteTable("org_settings", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  avoidConsecutive: integer("avoid_consecutive", { mode: "boolean" }).notNull().default(true),
  defaultMonthlyLimit: integer("default_monthly_limit").notNull().default(3),
  limitMode: text("limit_mode", { enum: ["hard", "soft"] }).notNull().default("hard"),
  minIntervalDays: integer("min_interval_days").notNull().default(7),
  prioritizeLess: integer("prioritize_less", { mode: "boolean" }).notNull().default(true),
  songMinIntervalDays: integer("song_min_interval_days").notNull().default(21),
  defaultSongCount: integer("default_song_count").notNull().default(5),
  /** Até que data a série de cultos de domingo já foi gerada (evita trabalho repetido). */
  sundaySeriesUntil: text("sunday_series_until"),
  /** Modelo padrão de posições para novos cultos: [{ functionId, count }] */
  defaultPositions: text("default_positions", { mode: "json" })
    .$type<{ functionId: string; count: number }[]>()
    .notNull()
    .default(sql`'[]'`),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// Usuários, sessões
// ---------------------------------------------------------------------------
export const users = sqliteTable(
  "users",
  {
    id: id(),
    organizationId: orgId(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    /** admin = líder/administrador; member = ministro ou músico */
    role: text("role", { enum: ["admin", "member"] }).notNull().default("member"),
    /**
     * Liderança por área (independente das funções musicais da pessoa e acumulável):
     * quem lidera a parte instrumental monta a banda; quem lidera os vocais monta
     * os vocais e define o repertório. Admin sempre pode tudo.
     */
    leadsInstrumental: integer("leads_instrumental", { mode: "boolean" }).notNull().default(false),
    leadsVocal: integer("leads_vocal", { mode: "boolean" }).notNull().default(false),
    participantId: text("participant_id").references(() => participants.id, { onDelete: "set null" }),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    /** SHA-256 do token. O token em si só existe no cookie do usuário. */
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/**
 * Passkeys (Face ID, digital, Windows Hello): credencial de chave pública por aparelho.
 * Só a chave PÚBLICA é guardada; a privada nunca sai do aparelho.
 */
export const passkeys = sqliteTable(
  "passkeys",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** ID da credencial (base64url), único no mundo. */
    credentialId: text("credential_id").notNull(),
    /** Chave pública COSE (base64url). */
    publicKey: text("public_key").notNull(),
    counter: integer("counter").notNull().default(0),
    transports: text("transports", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    /** Rótulo do aparelho ("iPhone", "Android", "Windows"…). */
    deviceName: text("device_name").notNull().default("Este aparelho"),
    createdAt: createdAt(),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
  },
  (t) => [uniqueIndex("passkeys_credential_uq").on(t.credentialId), index("passkeys_user_idx").on(t.userId)],
);

/** Desafios de uso único (5 min) das cerimônias WebAuthn: registro (com usuário) e login (anônimo). */
export const passkeyChallenges = sqliteTable("passkey_challenges", {
  id: id(),
  challenge: text("challenge").notNull(),
  purpose: text("purpose", { enum: ["register", "login"] }).notNull(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
});

export const loginAttempts = sqliteTable("login_attempts", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: integer("window_start", { mode: "timestamp_ms" }).notNull(),
});

// ---------------------------------------------------------------------------
// Funções / instrumentos (lista extensível)
// ---------------------------------------------------------------------------
export const FUNCTION_KINDS = ["minister", "vocal", "instrument", "tech"] as const;
export type FunctionKind = (typeof FUNCTION_KINDS)[number];

export const functions = sqliteTable(
  "functions",
  {
    id: id(),
    organizationId: orgId(),
    name: text("name").notNull(),
    kind: text("kind", { enum: FUNCTION_KINDS }).notNull().default("instrument"),
    sortOrder: integer("sort_order").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("functions_org_name_uq").on(t.organizationId, t.name)],
);

// ---------------------------------------------------------------------------
// Participantes
// ---------------------------------------------------------------------------
export const participants = sqliteTable(
  "participants",
  {
    id: id(),
    organizationId: orgId(),
    fullName: text("full_name").notNull(),
    displayName: text("display_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    photoUrl: text("photo_url"),
    level: text("level", { enum: ["iniciante", "intermediario", "avancado"] }),
    /** Dias da semana normalmente disponíveis (0=domingo). Vazio = sem preferência. */
    usualDays: text("usual_days", { mode: "json" }).$type<number[]>().notNull().default(sql`'[]'`),
    /** Limite pessoal por mês. Null = usa o padrão da organização. */
    monthlyLimit: integer("monthly_limit"),
    /** Observações administrativas — visíveis apenas para administradores. */
    notes: text("notes"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("participants_org_idx").on(t.organizationId)],
);

/** N:N participante ↔ função/instrumento. Uma pessoa pode ter várias funções. */
export const participantFunctions = sqliteTable(
  "participant_functions",
  {
    participantId: text("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    functionId: text("function_id")
      .notNull()
      .references(() => functions.id, { onDelete: "cascade" }),
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.participantId, t.functionId] })],
);

/** Indisponibilidades por período (um dia = start_date == end_date). */
export const unavailability = sqliteTable(
  "unavailability",
  {
    id: id(),
    organizationId: orgId(),
    participantId: text("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    /** Motivo privado: visível só para a própria pessoa e administradores. */
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [index("unav_participant_idx").on(t.participantId, t.startDate)],
);

// ---------------------------------------------------------------------------
// Eventos, recorrência, posições (escala)
// ---------------------------------------------------------------------------
export const EVENT_TYPES = ["culto", "ensaio", "evento", "conferencia", "culto_especial"] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export const EVENT_STATUSES = ["draft", "pending", "published", "completed", "cancelled"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const recurrenceRules = sqliteTable("recurrence_rules", {
  id: id(),
  organizationId: orgId(),
  title: text("title").notNull(),
  type: text("type", { enum: EVENT_TYPES }).notNull().default("culto"),
  /** 0=domingo … 6=sábado */
  weekday: integer("weekday").notNull(),
  /** null = toda semana; 1..5 = n-ésima ocorrência no mês; -1 = última */
  nthOfMonth: integer("nth_of_month"),
  startTime: text("start_time").notNull(),
  endTime: text("end_time"),
  location: text("location"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
});

export const events = sqliteTable(
  "events",
  {
    id: id(),
    organizationId: orgId(),
    title: text("title").notNull(),
    type: text("type", { enum: EVENT_TYPES }).notNull().default("culto"),
    date: text("date").notNull(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time"),
    location: text("location"),
    theme: text("theme"),
    notes: text("notes"),
    status: text("status", { enum: EVENT_STATUSES }).notNull().default("draft"),
    confirmDeadline: text("confirm_deadline"),
    recurrenceId: text("recurrence_id").references(() => recurrenceRules.id, { onDelete: "set null" }),
    /** Ensaio vinculado a este culto (opcional). */
    rehearsalId: text("rehearsal_id").references((): AnySQLiteColumn => events.id, { onDelete: "set null" }),
    /** Última alteração do repertório (quando e por quem) — feedback entre as lideranças. */
    setlistUpdatedAt: integer("setlist_updated_at", { mode: "timestamp_ms" }),
    setlistUpdatedBy: text("setlist_updated_by"),
    /** Escala bloqueada: geração automática não altera nenhuma posição deste evento. */
    scheduleLocked: integer("schedule_locked", { mode: "boolean" }).notNull().default(false),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("events_org_date_idx").on(t.organizationId, t.date),
    // Uma série nunca gera duas ocorrências na mesma data (proteção contra duplicação).
    uniqueIndex("events_series_date_uq").on(t.organizationId, t.recurrenceId, t.date).where(sql`${t.recurrenceId} is not null`),
  ],
);

export const SLOT_STATUSES = ["pending", "confirmed", "declined"] as const;
export type SlotStatus = (typeof SLOT_STATUSES)[number];

/**
 * Posição de uma escala (ex.: "Bateria" no culto X) e quem ocupa.
 * O ministro também é uma posição (função kind = minister).
 */
export const eventSlots = sqliteTable(
  "event_slots",
  {
    id: id(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    functionId: text("function_id")
      .notNull()
      .references(() => functions.id, { onDelete: "restrict" }),
    sortOrder: integer("sort_order").notNull().default(0),
    required: integer("required", { mode: "boolean" }).notNull().default(true),
    participantId: text("participant_id").references(() => participants.id, { onDelete: "set null" }),
    /** Convidado de fora da igreja (só nome, sem cadastro). Exclusivo com participantId. */
    guestName: text("guest_name"),
    /** FIXADO: a geração automática nunca substitui. */
    locked: integer("locked", { mode: "boolean" }).notNull().default(false),
    assignedBy: text("assigned_by", { enum: ["manual", "auto"] }),
    status: text("status", { enum: SLOT_STATUSES }).notNull().default("pending"),
    respondedAt: integer("responded_at", { mode: "timestamp_ms" }),
    declineReason: text("decline_reason"),
    /** "Preciso trocar": colega que a pessoa sugere para ir no lugar (a liderança decide). */
    swapSuggestedParticipantId: text("swap_suggested_participant_id").references(() => participants.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("slots_event_idx").on(t.eventId),
    index("slots_participant_idx").on(t.participantId),
  ],
);

// ---------------------------------------------------------------------------
// Músicas e repertório
// ---------------------------------------------------------------------------
export const songCategories = sqliteTable(
  "song_categories",
  {
    id: id(),
    organizationId: orgId(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("song_categories_org_name_uq").on(t.organizationId, t.name)],
);

export const songs = sqliteTable(
  "songs",
  {
    id: id(),
    organizationId: orgId(),
    title: text("title").notNull(),
    artist: text("artist"),
    /** Tom original (preparado para transposição futura). */
    originalKey: text("original_key"),
    bpm: integer("bpm"),
    durationSec: integer("duration_sec"),
    url: text("url"),
    categoryId: text("category_id").references(() => songCategories.id, { onDelete: "set null" }),
    theme: text("theme"),
    tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    difficulty: integer("difficulty"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("songs_org_idx").on(t.organizationId)],
);

/**
 * Links/materiais adicionais. function_id permite, no futuro, conteúdo por
 * instrumento (cifra da guitarra, partitura do teclado...). kind prepara para
 * PDF, áudio, vídeo, cifra, letra.
 */
export const songResources = sqliteTable(
  "song_resources",
  {
    id: id(),
    songId: text("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    functionId: text("function_id").references(() => functions.id, { onDelete: "set null" }),
    kind: text("kind", { enum: ["link", "video", "audio", "chords", "sheet", "lyrics", "pdf"] })
      .notNull()
      .default("link"),
    label: text("label"),
    url: text("url").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("song_resources_song_idx").on(t.songId)],
);

export const setlistItems = sqliteTable(
  "setlist_items",
  {
    id: id(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    songId: text("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    /** Tom usado neste culto (pode diferir do original). */
    key: text("key"),
    notes: text("notes"),
    locked: integer("locked", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("setlist_event_idx").on(t.eventId), uniqueIndex("setlist_event_song_uq").on(t.eventId, t.songId)],
);

/** Histórico de execução: base para "última execução", frequência, esquecidas. */
export const songPlays = sqliteTable(
  "song_plays",
  {
    id: id(),
    organizationId: orgId(),
    songId: text("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    eventId: text("event_id").references(() => events.id, { onDelete: "set null" }),
    date: text("date").notNull(),
    key: text("key"),
    createdAt: createdAt(),
  },
  (t) => [index("song_plays_song_idx").on(t.songId, t.date), uniqueIndex("song_plays_event_song_uq").on(t.eventId, t.songId)],
);

// ---------------------------------------------------------------------------
// Compartilhamento público e auditoria
// ---------------------------------------------------------------------------
export const shareLinks = sqliteTable("share_links", {
  id: id(),
  organizationId: orgId(),
  eventId: text("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  /** SHA-256 do token; o token aparece apenas uma vez para quem criou. */
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: id(),
    organizationId: orgId(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    summary: text("summary").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("audit_org_created_idx").on(t.organizationId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Cadastro por convite e redefinição de senha (sem e-mail)
// ---------------------------------------------------------------------------
/** Link de convite enviado pelo líder (ex.: no grupo). Só o hash do token fica no banco. */
export const invites = sqliteTable("invites", {
  id: id(),
  organizationId: orgId(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

/** Solicitação de cadastro aguardando aprovação. Some ao ser aprovada ou recusada. */
export const registrations = sqliteTable(
  "registrations",
  {
    id: id(),
    organizationId: orgId(),
    fullName: text("full_name").notNull(),
    displayName: text("display_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    passwordHash: text("password_hash").notNull(),
    functionIds: text("function_ids", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    createdAt: createdAt(),
  },
  (t) => [index("registrations_org_idx").on(t.organizationId)],
);

/** Link de redefinição de senha gerado por um administrador (uso único, com validade). */
export const passwordResets = sqliteTable("password_resets", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  usedAt: integer("used_at", { mode: "timestamp_ms" }),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

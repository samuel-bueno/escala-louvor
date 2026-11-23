import type { CivilDate } from "../dates";
import type { Rng } from "../random";

export interface DateRange {
  start: CivilDate;
  end: CivilDate;
}

export interface SchedParticipant {
  id: string;
  name: string;
  active: boolean;
  /** Funções/instrumentos cadastrados. Elegível SOMENTE para estes. */
  functionIds: string[];
  primaryFunctionId?: string | null;
  /** Limite pessoal por mês (null = padrão da organização). */
  monthlyLimit: number | null;
  unavailable: DateRange[];
  /** Dias da semana preferidos (0=domingo). Vazio = sem preferência. */
  usualDays: number[];
}

export interface SchedSlot {
  id: string;
  functionId: string;
  participantId: string | null;
  /** FIXADO: nunca é alterado pela geração. */
  locked: boolean;
  required?: boolean;
  sortOrder?: number;
}

export interface SchedEvent {
  id: string;
  title: string;
  date: CivilDate;
  startTime: string;
  endTime?: string | null;
  /** Escala bloqueada inteira. */
  locked?: boolean;
  slots: SchedSlot[];
}

/** Participação já registrada fora do lote (histórico e outros eventos). */
export interface Assignment {
  eventId: string;
  eventTitle: string;
  participantId: string;
  functionId: string;
  date: CivilDate;
  startTime: string;
  endTime?: string | null;
}

export interface DistributionRules {
  avoidConsecutive: boolean;
  defaultMonthlyLimit: number;
  /** hard = obrigatório (bloqueia); soft = preferência (penaliza). */
  limitMode: "hard" | "soft";
  minIntervalDays: number;
  prioritizeLess: boolean;
}

export const DEFAULT_RULES: DistributionRules = {
  avoidConsecutive: true,
  defaultMonthlyLimit: 3,
  limitMode: "hard",
  minIntervalDays: 7,
  prioritizeLess: true,
};

export interface GenerateOptions {
  /**
   * fill-empty: só preenche posições vazias (padrão, seguro).
   * replace-unlocked: propõe nova pessoa para toda posição não fixada.
   */
  mode: "fill-empty" | "replace-unlocked";
  /** Restringe a geração a estas funções (ex.: só ministros). */
  functionIds?: string[];
  /** Se informado, apenas estes participantes podem ser escolhidos. */
  eligibleIds?: string[];
  excludedIds?: string[];
  /** Máximo de participações por pessoa dentro do lote. */
  maxPerPerson?: number;
  rng: Rng;
  functionNames?: Record<string, string>;
}

export interface Rejection {
  participantId: string;
  name: string;
  reason: string;
}

export interface Proposal {
  eventId: string;
  slotId: string;
  functionId: string;
  /** Quem estava na posição quando a prévia foi gerada. */
  previousParticipantId: string | null;
  participantId: string | null;
  /** fixed = mantido (fixado, fora do escopo, ou já preenchido em fill-empty). */
  source: "fixed" | "generated" | "empty";
  reason: string;
  rejected: Rejection[];
  candidates: number;
}

export interface GenerationResult {
  proposals: Proposal[];
  warnings: string[];
  /** Quantas vezes cada participante aparece no lote (fixados + gerados). */
  counts: Record<string, number>;
}

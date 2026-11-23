/**
 * Políticas de autorização — FONTE ÚNICA.
 *
 * Papel no sistema (quem é) ≠ função musical (o que toca/canta):
 *  - papel: admin | liderança instrumental | liderança vocal | membro
 *  - função: bateria, violão, ministro, backing vocal… (functions.kind)
 *
 * A liderança é marcada explicitamente em users (leadsInstrumental / leadsVocal).
 * Nunca se deduz de tocar um instrumento. As marcas acumulam.
 *
 * A área de uma posição vem de functions.kind (explícito no banco), nunca do nome:
 *   minister, vocal → vocal | instrument → instrumental | tech → other (só admin)
 */

export type FunctionKind = "minister" | "vocal" | "instrument" | "tech";
export type Area = "instrumental" | "vocal" | "other";

export interface Actor {
  role: "admin" | "member";
  leadsInstrumental: boolean;
  leadsVocal: boolean;
}

export const AREA_LABELS: Record<Area, string> = { instrumental: "Instrumental", vocal: "Vocais", other: "Técnica" };

export function areaOfKind(kind: string): Area {
  if (kind === "minister" || kind === "vocal") return "vocal";
  if (kind === "instrument") return "instrumental";
  return "other";
}

const isAdmin = (a: Actor) => a.role === "admin";

/** Pode montar/alterar as posições desta área da escala. */
export function canEditArea(a: Actor, area: Area): boolean {
  if (isAdmin(a)) return true;
  if (area === "instrumental") return a.leadsInstrumental;
  if (area === "vocal") return a.leadsVocal;
  return false; // posições técnicas: só administração
}

export const canEditInstrumental = (a: Actor) => canEditArea(a, "instrumental");
export const canEditVocals = (a: Actor) => canEditArea(a, "vocal");

/** Repertório do culto (ordem, tom, observações): liderança vocal + admin. */
export const canEditSetlist = (a: Actor) => isAdmin(a) || a.leadsVocal;
/** Biblioteca de músicas (cadastrar/editar/importar): mesma responsabilidade do repertório. */
export const canManageSongs = canEditSetlist;

/** Líder (de qualquer área) ou admin: acompanha a operação e monta escalas. */
export const isLeader = (a: Actor) => isAdmin(a) || a.leadsInstrumental || a.leadsVocal;
export const canViewTeamOps = isLeader;
/** Publicar a escala para a equipe confirmar. */
export const canPublishSchedule = isLeader;

/** Somente administração. */
export const canManagePeople = isAdmin;
export const canManageSettings = isAdmin;
export const canManageEvents = isAdmin; // criar, editar dados, cancelar, concluir, apagar
export const canManageFunctions = isAdmin;
export const canSeeUnavailabilityReasons = isAdmin;

export function areasEditable(a: Actor): Area[] {
  return (["instrumental", "vocal", "other"] as const).filter((x) => canEditArea(a, x));
}

export type RoleLabel = "Administrador" | "Líder dos músicos" | "Líder dos vocais" | "Líder dos músicos e vocais" | "Membro";
export function roleLabel(a: Actor): RoleLabel {
  if (isAdmin(a)) return "Administrador";
  if (a.leadsInstrumental && a.leadsVocal) return "Líder dos músicos e vocais";
  if (a.leadsInstrumental) return "Líder dos músicos";
  if (a.leadsVocal) return "Líder dos vocais";
  return "Membro";
}

export interface SlotChange {
  /** Área da função antes e depois (null = não existia / foi removida). */
  before: { area: Area; sig: string } | null;
  after: { area: Area; sig: string } | null;
}

/**
 * Diferença entre a escala salva e a enviada: devolve as áreas que o ator tentou
 * alterar sem permissão. Cada slot carrega uma assinatura (função, pessoa, convidado,
 * fixação, obrigatoriedade, observação); mudou a assinatura = alteração.
 */
export function forbiddenAreas(a: Actor, changes: SlotChange[]): Area[] {
  const bad = new Set<Area>();
  for (const c of changes) {
    if (c.before && c.after && c.before.sig === c.after.sig && c.before.area === c.after.area) continue;
    for (const side of [c.before, c.after]) if (side && !canEditArea(a, side.area)) bad.add(side.area);
  }
  return [...bad];
}

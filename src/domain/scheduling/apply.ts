/**
 * Aplicação de uma prévia sobre o estado ATUAL do banco.
 *
 * Garante que a geração nunca sobrescreve nada silenciosamente:
 *  - posição fixada nunca muda;
 *  - se alguém alterou a posição depois da prévia → conflito "stale" (recusa);
 *  - substituir uma pessoa já escalada exige confirmação explícita.
 */
export interface CurrentSlot {
  id: string;
  participantId: string | null;
  locked: boolean;
}

export interface ProposedChange {
  slotId: string;
  /** Quem estava na posição quando a prévia foi gerada. */
  previousParticipantId: string | null;
  participantId: string | null;
}

export interface ApplyPlan {
  updates: { slotId: string; participantId: string | null }[];
  /** Posições que mudaram desde a prévia — precisam de nova prévia. */
  stale: string[];
  /** Posições preenchidas que seriam substituídas e ainda não foram confirmadas. */
  needsConfirmation: string[];
  /** Posições fixadas que a prévia tentou mudar (ignoradas). */
  lockedSkipped: string[];
}

export function planApply(current: CurrentSlot[], changes: ProposedChange[], opts: { confirmReplace: boolean }): ApplyPlan {
  const byId = new Map(current.map((s) => [s.id, s]));
  const plan: ApplyPlan = { updates: [], stale: [], needsConfirmation: [], lockedSkipped: [] };
  for (const c of changes) {
    const cur = byId.get(c.slotId);
    if (!cur) {
      plan.stale.push(c.slotId);
      continue;
    }
    if (cur.participantId === c.participantId) continue; // nada a fazer
    if (cur.locked) {
      plan.lockedSkipped.push(c.slotId);
      continue;
    }
    if (cur.participantId !== c.previousParticipantId) {
      plan.stale.push(c.slotId);
      continue;
    }
    if (cur.participantId !== null && !opts.confirmReplace) {
      plan.needsConfirmation.push(c.slotId);
      continue;
    }
    plan.updates.push({ slotId: c.slotId, participantId: c.participantId });
  }
  return plan;
}

/** Só é seguro gravar quando não há conflitos pendentes. */
export function canCommit(plan: ApplyPlan): boolean {
  return plan.stale.length === 0 && plan.needsConfirmation.length === 0;
}

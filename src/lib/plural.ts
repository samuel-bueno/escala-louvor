/** Concordância em pt-BR: 0 e 1 usam o singular ("1 pessoa", "0 pessoas" → plural para 0 só com `zeroSingular` falso). */
export function plural(n: number, one: string, many: string): string {
  return Math.abs(n) === 1 ? one : many;
}

/** "1 pessoa" / "3 pessoas". */
export function count(n: number, one: string, many: string): string {
  return `${n} ${plural(n, one, many)}`;
}

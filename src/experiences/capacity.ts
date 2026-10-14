/**
 * Límite del local: el cupo por turno de una experiencia que no tiene mesa
 * asignada. No se carga a mano ningún cupo por experiencia.
 */
export const DEFAULT_EXPERIENCE_CAPACITY = 40;

/**
 * Cupo por turno de una experiencia: si tiene mesa/s asignadas (mesa
 * compartida), los lugares de esas mesas; si no, el límite del local.
 * Las mesas asignadas se arman juntas: una mesa grande con otra unida pierde
 * la punta (G + M = 10 + 2 - 1 = 11), igual que al reservar.
 */
export function capacityFor(
  sharedTableCodes: string[] | null | undefined,
  tables: Array<{ code: string; seats: number; kind?: 'SMALL' | 'LARGE' }>,
): number {
  const codes = new Set((sharedTableCodes ?? []).map((c) => c.toUpperCase()));
  const chosen = tables.filter((t) => codes.has(t.code.toUpperCase()));
  const seats = chosen.reduce((sum, t) => sum + t.seats, 0);
  if (seats <= 0) return DEFAULT_EXPERIENCE_CAPACITY;
  const joinedLarges =
    chosen.length > 1 ? chosen.filter((t) => t.kind === 'LARGE').length : 0;
  return seats - joinedLarges;
}

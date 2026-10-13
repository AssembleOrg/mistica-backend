/**
 * Límite del local: el cupo por turno de una experiencia que no tiene mesa
 * asignada. No se carga a mano ningún cupo por experiencia.
 */
export const DEFAULT_EXPERIENCE_CAPACITY = 40;

/**
 * Cupo por turno de una experiencia: si tiene mesa/s asignadas (mesa
 * compartida), los lugares de esas mesas; si no, el límite del local.
 */
export function capacityFor(
  sharedTableCodes: string[] | null | undefined,
  tables: Array<{ code: string; seats: number }>,
): number {
  const codes = new Set((sharedTableCodes ?? []).map((c) => c.toUpperCase()));
  const seats = tables
    .filter((t) => codes.has(t.code.toUpperCase()))
    .reduce((sum, t) => sum + t.seats, 0);
  return seats > 0 ? seats : DEFAULT_EXPERIENCE_CAPACITY;
}

/**
 * Cupo por turno de una experiencia cuando no se carga ninguno. El cupo no es
 * obligatorio: vacío (ausente, null o 0) significa este límite.
 */
export const DEFAULT_EXPERIENCE_CAPACITY = 40;

/** El cupo cargado o, si vino vacío, el cupo por defecto. */
export function capacityOrDefault(value: number | null | undefined): number {
  return typeof value === 'number' && value >= 1
    ? value
    : DEFAULT_EXPERIENCE_CAPACITY;
}

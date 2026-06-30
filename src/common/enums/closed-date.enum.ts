// Tipo de regla de cierre del local.
// DATE: un rango de fechas concreto [from, to] (un día suelto = from==to).
// WEEKLY: un día de la semana recurrente (ej. todos los lunes).
export enum ClosedDateKind {
  DATE = 'DATE',
  WEEKLY = 'WEEKLY',
}

import { PieceStatusConfig } from '../common/enums/piece.enum';

/** Totales de TODA la reserva: no dependen de la página ni del filtro en pantalla. */
export interface ReservationPieceTotals {
  /** Piezas que hay que entregar (sin tela/yeso, que se llevan en el día). */
  deliver: number;
  /** De esas, cuántas ya están listas o retiradas. */
  done: number;
  /** Tela, yeso…: se las llevaron en el día. */
  takenSameDay: number;
  /** Ya se avisó a la persona. */
  notified: boolean;
  /** Una pieza lista: el aviso de retiro se dispara desde ella. */
  readyPieceId?: string;
}

interface PieceForTotals {
  _id: unknown;
  reservationId?: unknown;
  status: string;
  material?: string;
  notifiedReadyAt?: Date;
}

export function summarizeReservationPieces(
  pieces: PieceForTotals[],
  statusCfg: PieceStatusConfig[],
): Record<string, ReservationPieceTotals> {
  const byKey = new Map(statusCfg.map((c) => [c.key, c]));
  const totals: Record<string, ReservationPieceTotals> = {};
  for (const piece of pieces) {
    if (!piece.reservationId) continue;
    const id = String(piece.reservationId);
    const row = (totals[id] ??= {
      deliver: 0,
      done: 0,
      takenSameDay: 0,
      notified: false,
    });
    if (piece.material) {
      row.takenSameDay += 1;
      continue;
    }
    row.deliver += 1;
    const cfg = byKey.get(piece.status);
    if (cfg?.isReady || cfg?.isFinal) row.done += 1;
    if (cfg?.isReady && !row.readyPieceId) row.readyPieceId = String(piece._id);
    if (piece.notifiedReadyAt) row.notified = true;
  }
  return totals;
}

/**
 * Parte la lista en páginas sin cortar un pedido al medio: una página llega
 * hasta `limit` piezas y se estira hasta terminar el pedido que venía mostrando.
 * `keys` es la clave de pedido de cada pieza, en el orden del listado.
 */
export function pageBoundsByGroup(
  keys: string[],
  limit: number,
): Array<{ start: number; end: number }> {
  const pages: Array<{ start: number; end: number }> = [];
  let start = 0;
  for (let i = 1; i <= keys.length; i++) {
    const groupEnds = i === keys.length || keys[i] !== keys[i - 1];
    if (groupEnds && i - start >= limit) {
      pages.push({ start, end: i });
      start = i;
    }
  }
  if (start < keys.length) pages.push({ start, end: keys.length });
  return pages;
}

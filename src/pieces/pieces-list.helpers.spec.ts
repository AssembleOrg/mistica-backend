import { DEFAULT_PIECE_STATUS_CONFIG, PieceStatus } from '../common/enums/piece.enum';
import {
  pageBoundsByGroup,
  summarizeReservationPieces,
} from './pieces-list.helpers';

const piece = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  _id: id,
  reservationId: 'res1',
  status,
  ...extra,
});

describe('summarizeReservationPieces', () => {
  it('cuenta toda la reserva: 11 listas de 20 no es un pedido completo', () => {
    const pieces = [
      ...Array.from({ length: 11 }, (_, i) => piece(`l${i}`, PieceStatus.LISTA)),
      ...Array.from({ length: 9 }, (_, i) => piece(`p${i}`, PieceStatus.PENDIENTE)),
    ];
    const { res1 } = summarizeReservationPieces(pieces, DEFAULT_PIECE_STATUS_CONFIG);
    expect(res1.deliver).toBe(20);
    expect(res1.done).toBe(11);
    expect(res1.readyPieceId).toBe('l0');
  });

  it('lo que se llevaron en el día no deja el pedido incompleto', () => {
    const pieces = [
      piece('a', PieceStatus.LISTA),
      piece('b', PieceStatus.RETIRADA),
      piece('c', PieceStatus.RETIRADA, { material: 'yeso' }),
    ];
    const { res1 } = summarizeReservationPieces(pieces, DEFAULT_PIECE_STATUS_CONFIG);
    expect(res1).toEqual({
      deliver: 2,
      done: 2,
      takenSameDay: 1,
      notified: false,
      readyPieceId: 'a',
    });
  });

  it('marca avisado si cualquier pieza del pedido ya se avisó', () => {
    const pieces = [
      piece('a', PieceStatus.LISTA, { notifiedReadyAt: new Date() }),
      piece('b', PieceStatus.PENDIENTE),
    ];
    const { res1 } = summarizeReservationPieces(pieces, DEFAULT_PIECE_STATUS_CONFIG);
    expect(res1.notified).toBe(true);
  });
});

describe('pageBoundsByGroup', () => {
  it('no parte un pedido entre dos páginas', () => {
    const keys = ['a', 'a', 'b', 'b', 'b', 'c'];
    expect(pageBoundsByGroup(keys, 3)).toEqual([
      { start: 0, end: 5 },
      { start: 5, end: 6 },
    ]);
  });

  it('un pedido más grande que la página entra entero y no deja páginas vacías', () => {
    const keys = [...Array(7).fill('a'), 'b'];
    expect(pageBoundsByGroup(keys, 3)).toEqual([
      { start: 0, end: 7 },
      { start: 7, end: 8 },
    ]);
  });

  it('sin piezas no hay páginas', () => {
    expect(pageBoundsByGroup([], 50)).toEqual([]);
  });
});

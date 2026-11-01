import { Types } from 'mongoose';
import { PiecesService } from './pieces.service';
import { ReservationsService } from '../reservations/reservations.service';
import { ReservationStatus } from '../common/enums';

/**
 * Corregir el adicional de una ficha ya registrada (se cargó sin adicional o
 * con otro): el total y el saldo de la reserva se ajustan por la diferencia.
 */

const RES_ID = '66aa00000000000000000001';
const PIECE_ID = '66bb00000000000000000001';
const YESO = '66cc00000000000000000001';
const PREMIUM = '66cc00000000000000000002';

const catalog = new Map([
  [YESO, { id: YESO, name: 'Yeso 2x1', amount: 7000, pair: true, material: 'yeso' }],
  [PREMIUM, { id: PREMIUM, name: 'Premium', amount: 5000, addAmount: 12000, pair: false }],
]);

function piece(extra: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(PIECE_ID),
    reservationId: new Types.ObjectId(RES_ID),
    pieceType: 'Yeso 2x1',
    save: jest.fn(async () => undefined),
    ...extra,
  } as Record<string, any>;
}

function build(p: Record<string, any>) {
  const replacePieceExtra = jest.fn(async () => undefined);
  const service = new PiecesService(
    { findOne: async () => p } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { replacePieceExtra } as never,
    { byIds: async (ids: string[]) => new Map(ids.filter((i) => catalog.has(i)).map((i) => [i, catalog.get(i)!])) } as never,
    {} as never,
  );
  return { service, replacePieceExtra };
}

const admin = { id: 'u1', role: 'admin' };

describe('Editar el adicional de una ficha', () => {
  it('ficha sin adicional → con adicional: suma a la reserva', async () => {
    const p = piece();
    const { service, replacePieceExtra } = build(p);
    await service.update(PIECE_ID, { extraId: YESO } as never, admin);
    expect(p).toMatchObject({ extraName: 'Yeso 2x1', extraAmount: 7000, material: 'yeso' });
    expect(String(p.extraId)).toBe(YESO);
    expect(replacePieceExtra).toHaveBeenCalledWith(RES_ID, PIECE_ID, {
      label: 'Adicional pieza Yeso 2x1 (Yeso 2x1)',
      amount: 7000,
    });
    expect(p.save).toHaveBeenCalled();
  });

  it('pieza adicional: cobra el precio de pieza adicional', async () => {
    const p = piece({ pieceType: 'Taza' });
    const { service, replacePieceExtra } = build(p);
    await service.update(PIECE_ID, { extraId: PREMIUM, additional: true } as never, admin);
    expect(replacePieceExtra).toHaveBeenCalledWith(RES_ID, PIECE_ID, {
      label: 'Pieza adicional Premium (Taza)',
      amount: 12000,
    });
  });

  it("quitar el adicional ('') lo saca de la reserva", async () => {
    const p = piece({ extraName: 'Premium', extraAmount: 5000 });
    const { service, replacePieceExtra } = build(p);
    await service.update(PIECE_ID, { extraId: '' } as never, admin);
    expect(p.extraName).toBeUndefined();
    expect(replacePieceExtra).toHaveBeenCalledWith(RES_ID, PIECE_ID, null);
  });

  it('mismo adicional (ficha vieja sin id): no toca la reserva', async () => {
    const p = piece({ extraName: 'Yeso 2x1', extraAmount: 7000 });
    const { service, replacePieceExtra } = build(p);
    await service.update(PIECE_ID, { extraId: YESO, additional: false } as never, admin);
    expect(replacePieceExtra).not.toHaveBeenCalled();
    expect(String(p.extraId)).toBe(YESO);
  });

  it('sin rol de gestión no se puede cambiar', async () => {
    const { service } = build(piece());
    await expect(
      service.update(PIECE_ID, { extraId: YESO } as never, { id: 'u2', role: 'professor' }),
    ).rejects.toThrow();
  });
});

describe('replacePieceExtra', () => {
  function reservation(extras: unknown[], totalAmount: number, balanceDue: number) {
    return {
      status: ReservationStatus.CONFIRMED,
      extras,
      totalAmount,
      balanceDue,
      save: jest.fn(async () => undefined),
    } as Record<string, any>;
  }
  function svc(r: Record<string, any>) {
    const s = Object.create(ReservationsService.prototype) as ReservationsService;
    Object.assign(s, {
      findByIdOrThrow: async () => r,
      publicView: (x: unknown) => x,
    });
    return s;
  }

  it('reserva pagada + adicional olvidado: el saldo pasa a ser el adicional', async () => {
    const r = reservation([], 84000, 0);
    await svc(r).replacePieceExtra(RES_ID, PIECE_ID, { label: 'Adicional pieza Yeso 2x1', amount: 7000 });
    expect(r.totalAmount).toBe(91000);
    expect(r.balanceDue).toBe(7000);
    expect(r.extras).toHaveLength(1);
  });

  it('cambia uno por otro: ajusta por la diferencia', async () => {
    const r = reservation(
      [{ label: 'x', amount: 5000, pieceId: new Types.ObjectId(PIECE_ID) }, { label: 'torta', amount: 3000 }],
      92000,
      8000,
    );
    await svc(r).replacePieceExtra(RES_ID, PIECE_ID, { label: 'y', amount: 7000 });
    expect(r.totalAmount).toBe(94000);
    expect(r.balanceDue).toBe(10000);
    expect(r.extras.map((x: { label: string }) => x.label)).toEqual(['torta', 'y']);
  });
});

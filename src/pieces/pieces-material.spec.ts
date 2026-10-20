import { PieceStatus } from '../common/enums/piece.enum';
import { PiecesService } from './pieces.service';

/**
 * Tela, bastidor, yeso…: no van al horno, se las llevan en el día. Quedan
 * registradas como retiradas para que el pedido de la reserva se complete
 * con las de cerámica.
 */

const RES_ID = '66aa00000000000000000001';

function build(opts: { pending?: unknown[] } = {}) {
  const inserted: Record<string, unknown>[] = [];
  const bulk: unknown[] = [];
  const pieceModel = {
    find: jest.fn(() => ({
      select: () => ({ lean: async () => opts.pending ?? [] }),
    })),
    insertMany: jest.fn(async (docs: Record<string, unknown>[]) => {
      inserted.push(...docs);
      return docs;
    }),
    bulkWrite: jest.fn(async (ops: unknown[]) => {
      bulk.push(...ops);
    }),
  };
  const reservationModel = {
    findOne: () => ({
      select: () => ({
        lean: async () => ({
          _id: RES_ID,
          code: 'NDQ460',
          customerName: 'Stefanie Gómez',
          customerPhone: '1155555555',
          experienceName: 'Arte & Degustación',
          startAt: new Date('2026-10-17T18:00:00Z'),
        }),
      }),
    }),
  };
  const pieceExtras = {
    byIds: jest.fn(async () => new Map()),
    list: jest.fn(async () => [
      { id: 'x1', name: 'Tela premium', amount: 500, pair: false, material: 'tela' },
      { id: 'x2', name: 'Premium', amount: 500, pair: false },
    ]),
  };
  const pieceTypes = {
    materialsByName: jest.fn(
      async () => new Map([['bastidor', 'tela'], ['mate de yeso', 'yeso']]),
    ),
  };
  const service = new PiecesService(
    pieceModel as never,
    reservationModel as never,
    {} as never, // student
    {} as never, // group
    {} as never, // user
    {} as never, // notifications
    { ofUser: async () => null } as never,
    {} as never, // reservations
    pieceExtras as never,
    pieceTypes as never,
  );
  return { service, inserted, bulk };
}

describe('Piezas de tela, yeso…', () => {
  it('al cargarlas quedan retiradas con su material; las de cerámica, pendientes', async () => {
    const { service, inserted } = build();
    await service.createReservationBatch({
      reservationId: RES_ID,
      entries: [
        { personName: 'Ana', pieceType: 'Taza', signature: 'A', colorsUsed: 'Azul' },
        { personName: 'Bea', pieceType: 'Bastidor' },
      ],
    } as never);
    expect(inserted[0]).toMatchObject({ status: PieceStatus.PENDIENTE });
    expect(inserted[0].material).toBeUndefined();
    expect(inserted[1]).toMatchObject({ status: PieceStatus.RETIRADA, material: 'tela' });
    expect(inserted[1].pickedUpAt).toBeInstanceOf(Date);
  });

  it('las viejas se corrigen una vez, por adicional o por tipo de pieza', async () => {
    const { service, bulk } = build({
      pending: [
        { _id: 'p1', pieceType: 'Taza', extraName: 'Premium', workDate: '2026-10-17' },
        { _id: 'p2', pieceType: 'Cuadro', extraName: 'Tela premium', workDate: '2026-10-17' },
        { _id: 'p3', pieceType: 'Mate de yeso', workDate: '2026-10-18' },
      ],
    });
    await (service as unknown as { backfillMaterials(): Promise<void> }).backfillMaterials();
    expect(bulk).toHaveLength(2);
    expect(bulk[0]).toMatchObject({
      updateOne: {
        filter: { _id: 'p2' },
        update: { $set: { material: 'tela', status: PieceStatus.RETIRADA } },
      },
    });
    expect(bulk[1]).toMatchObject({
      updateOne: { filter: { _id: 'p3' }, update: { $set: { material: 'yeso' } } },
    });
  });
});

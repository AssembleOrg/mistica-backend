import { BadRequestException, ConflictException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { DateTime } from 'luxon';
import { Types } from 'mongoose';
import { DayOccupancy } from '../common/schemas/day-occupancy.schema';
import { Reservation } from '../common/schemas/reservation.schema';
import { Table } from '../common/schemas/table.schema';
import { TablesService } from './tables.service';

const TZ = 'America/Argentina/Buenos_Aires';

const TABLE_ROWS = [
  ...Array.from({ length: 10 }, (_, i) => ({
    code: `M${i + 1}`,
    kind: 'SMALL' as const,
    seats: 2,
    order: i + 1,
  })),
  { code: 'G1', kind: 'LARGE' as const, seats: 10, order: 101 },
  { code: 'G2', kind: 'LARGE' as const, seats: 10, order: 102 },
];

function at(dateKey: string, hhmm: string): Date {
  return DateTime.fromISO(`${dateKey}T${hhmm}`, { zone: TZ }).toJSDate();
}

/** Modelo de mesas: sólo necesita responder la cadena find().select().sort().lean() */
function tableModelMock() {
  return {
    find: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(TABLE_ROWS),
        }),
      }),
    }),
  };
}

/**
 * Modelo del día. `slots` es el estado que devuelve findOne; `updateResults` es
 * la cola de respuestas de updateOne (para simular perder la carrera).
 */
function dayModelMock(
  slots: Record<string, unknown>[] = [],
  updateResults: Array<{ matchedCount: number; upsertedCount: number }> = [],
) {
  const queue = [...updateResults];
  return {
    findOne: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(slots.length ? { slots } : null),
    }),
    updateOne: jest
      .fn()
      .mockImplementation(() =>
        Promise.resolve(queue.shift() ?? { matchedCount: 1, upsertedCount: 0 }),
      ),
    updateMany: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  };
}

/** Guarda y update de una llamada a updateOne, tipados para poder inspeccionarlos. */
interface Guard {
  date: string;
  slots?: { $not: { $elemMatch: Record<string, unknown> } };
  $and?: Array<{
    slots: {
      $not?: { $elemMatch: Record<string, unknown> };
      $elemMatch?: Record<string, unknown>;
    };
  }>;
}
interface PushUpdate {
  $push: { slots: { $each: unknown[] } };
}

function callArgs(
  day: ReturnType<typeof dayModelMock>,
  index = 0,
): [Guard, PushUpdate] {
  return day.updateOne.mock.calls[index] as unknown as [Guard, PushUpdate];
}

/** Sólo lo usa la agenda; los tests de asignación no lo tocan. */
function reservationModelMock(rows: Record<string, unknown>[] = []) {
  return {
    find: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

async function build(
  dayModel: ReturnType<typeof dayModelMock>,
  reservations: Record<string, unknown>[] = [],
) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      TablesService,
      { provide: getModelToken(Table.name), useValue: tableModelMock() },
      { provide: getModelToken(DayOccupancy.name), useValue: dayModel },
      {
        provide: getModelToken(Reservation.name),
        useValue: reservationModelMock(reservations),
      },
    ],
  }).compile();
  return moduleRef.get(TablesService);
}

describe('TablesService · disponibilidad', () => {
  it('con el día vacío están todas las mesas libres', async () => {
    const service = await build(dayModelMock());
    const free = await service.freeTablesFor('2026-08-01', 'T1');
    expect(free.small).toHaveLength(10);
    expect(free.large).toEqual(['G1', 'G2']);
    expect(free.shareableLarge).toEqual([]);
  });

  it('descuenta las mesas ocupadas de ese turno', async () => {
    const service = await build(
      dayModelMock([
        {
          shift: 'T1',
          table: 'M1',
          qty: 2,
          reservationId: new Types.ObjectId(),
        },
        {
          shift: 'T1',
          table: 'M2',
          qty: 2,
          reservationId: new Types.ObjectId(),
        },
      ]),
    );
    const free = await service.freeTablesFor('2026-08-01', 'T1');
    expect(free.small).not.toContain('M1');
    expect(free.small).not.toContain('M2');
    expect(free.small).toHaveLength(8);
  });

  it('las mesas de otro turno no cuentan', async () => {
    const service = await build(
      dayModelMock([
        {
          shift: 'T2',
          table: 'M1',
          qty: 2,
          reservationId: new Types.ObjectId(),
        },
      ]),
    );
    const free = await service.freeTablesFor('2026-08-01', 'T1');
    expect(free.small).toHaveLength(10);
  });

  it('una grande con un solo grupo queda como compartible, no como libre', async () => {
    const holder = new Types.ObjectId();
    const service = await build(
      dayModelMock([
        { shift: 'T1', table: 'G1', qty: 4, reservationId: holder },
      ]),
    );
    const free = await service.freeTablesFor('2026-08-01', 'T1');
    expect(free.large).toEqual(['G2']);
    expect(free.shareableLarge).toEqual([
      { code: 'G1', holderQty: 4, holderReservationId: String(holder) },
    ]);
  });

  it('una grande bloqueada a mano no se puede compartir', async () => {
    const service = await build(
      dayModelMock([
        { shift: 'T1', table: 'G1', qty: 0, label: 'Taller mensual' },
      ]),
    );
    const free = await service.freeTablesFor('2026-08-01', 'T1');
    expect(free.large).toEqual(['G2']);
    expect(free.shareableLarge).toEqual([]);
  });

  it('remainingPartySize es el grupo más grande que entra, no la suma de asientos', async () => {
    // Quedan 3 mesas de 2 y ninguna grande: el tope de UNA reserva es 6.
    const busy = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'G1', 'G2'].map(
      (table) => ({
        shift: 'T1',
        table,
        qty: 2,
        reservationId: new Types.ObjectId(),
      }),
    );
    const service = await build(dayModelMock(busy));
    expect(await service.remainingPartySize('2026-08-01', 'T1')).toBe(6);
  });
});

describe('TablesService · asignación atómica', () => {
  it('escribe todas las mesas en una sola operación guardada', async () => {
    const day = dayModelMock();
    const service = await build(day);
    const reservationId = new Types.ObjectId();

    const assignment = await service.assign({
      reservationId,
      qty: 4,
      startAt: at('2026-08-01', '15:00'),
      durationMinutes: 120,
    });

    expect(assignment.shiftKey).toBe('T1');
    expect(assignment.tables.map((t) => t.code)).toEqual(['M1', 'M2']);
    expect(assignment.shared).toBe(false);

    expect(day.updateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = callArgs(day);
    // La guarda impide que las mesas del plan estén tomadas en ese turno.
    expect(filter).toEqual({
      date: '2026-08-01',
      slots: {
        $not: {
          $elemMatch: { shift: 'T1', table: { $in: ['M1', 'M2'] } },
        },
      },
    });
    // Y el push mete las dos mesas juntas: todo o nada.
    expect(update.$push.slots.$each).toHaveLength(2);
  });

  it('replanifica cuando pierde la carrera y otra reserva se quedó con la mesa', async () => {
    const day = dayModelMock(
      [],
      [
        { matchedCount: 0, upsertedCount: 0 }, // perdió
        { matchedCount: 1, upsertedCount: 0 }, // ganó
      ],
    );
    const service = await build(day);

    const assignment = await service.assign({
      reservationId: new Types.ObjectId(),
      qty: 2,
      startAt: at('2026-08-01', '15:00'),
      durationMinutes: 120,
    });

    expect(day.updateOne).toHaveBeenCalledTimes(2);
    expect(assignment.tables.map((t) => t.code)).toEqual(['M1']);
  });

  it('se rinde después de varios intentos fallidos', async () => {
    const day = dayModelMock(
      [],
      Array.from({ length: 5 }, () => ({
        matchedCount: 0,
        upsertedCount: 0,
      })),
    );
    const service = await build(day);

    await expect(
      service.assign({
        reservationId: new Types.ObjectId(),
        qty: 2,
        startAt: at('2026-08-01', '15:00'),
        durationMinutes: 120,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rechaza el grupo que no entra en las mesas libres', async () => {
    const busy = TABLE_ROWS.map((t) => ({
      shift: 'T1',
      table: t.code,
      qty: 2,
      reservationId: new Types.ObjectId(),
    }));
    const service = await build(dayModelMock(busy));

    await expect(
      service.assign({
        reservationId: new Types.ObjectId(),
        qty: 2,
        startAt: at('2026-08-01', '15:00'),
        durationMinutes: 120,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('exige el consentimiento antes de meter a alguien en una mesa compartida', async () => {
    const holder = new Types.ObjectId();
    const slots = [
      ...TABLE_ROWS.filter((t) => t.kind === 'SMALL').map((t) => ({
        shift: 'T1',
        table: t.code,
        qty: 2,
        reservationId: new Types.ObjectId(),
      })),
      { shift: 'T1', table: 'G1', qty: 4, reservationId: holder },
      {
        shift: 'T1',
        table: 'G2',
        qty: 10,
        reservationId: new Types.ObjectId(),
      },
    ];
    const service = await build(dayModelMock(slots));

    const req = {
      reservationId: new Types.ObjectId(),
      qty: 4,
      startAt: at('2026-08-01', '15:00'),
      durationMinutes: 120,
    };
    await expect(service.assign(req)).rejects.toBeInstanceOf(ConflictException);

    // Con la aceptación del cliente, entra en la mesa grande compartida.
    const day = dayModelMock(slots);
    const service2 = await build(day);
    const assignment = await service2.assign({
      ...req,
      sharedAccepted: true,
    });
    expect(assignment.shared).toBe(true);
    expect(assignment.tables.map((t) => t.code)).toEqual(['G1']);
    expect(assignment.sharedWithReservationId).toBe(String(holder));

    // La guarda de la compartida verifica que el otro grupo siga ahí y solo.
    const [filter] = callArgs(day);
    expect(filter.$and?.[0].slots.$not?.$elemMatch.reservationId).toEqual({
      $ne: holder,
    });
    expect(filter.$and?.[1].slots.$elemMatch).toMatchObject({
      shift: 'T1',
      reservationId: holder,
      qty: { $lte: 4 },
    });
  });
});

describe('TablesService · turnos', () => {
  it('rechaza un horario que cruza de un turno al otro y sugiere los válidos', async () => {
    const service = await build(dayModelMock());
    await expect(
      service.assign({
        reservationId: new Types.ObjectId(),
        qty: 2,
        startAt: at('2026-08-01', '16:00'),
        durationMinutes: 120,
      }),
    ).rejects.toThrow(/entre 15:00 y 15:30/);
  });

  it('avisa cuando la experiencia no entra en ningún turno', async () => {
    const service = await build(dayModelMock());
    await expect(
      service.assign({
        reservationId: new Types.ObjectId(),
        qty: 2,
        startAt: at('2026-08-01', '15:00'),
        durationMinutes: 180,
      }),
    ).rejects.toThrow(/no entra en ningún turno/);
  });

  it('placementFor ubica fecha de negocio y turno', async () => {
    const service = await build(dayModelMock());
    expect(service.placementFor(at('2026-08-01', '17:50'), 120)).toEqual({
      dateKey: '2026-08-01',
      shiftKey: 'T2',
    });
  });

  it('placementFor explota con un horario imposible', async () => {
    const service = await build(dayModelMock());
    expect(() => service.placementFor(at('2026-08-01', '19:00'), 120)).toThrow(
      BadRequestException,
    );
  });
});

describe('TablesService · agenda del día', () => {
  const r1 = new Types.ObjectId();
  const r2 = new Types.ObjectId();

  const slots = [
    // Un grupo de 6 con tres mesas de 2 en el turno 1.
    ...['M1', 'M2', 'M3'].map((table) => ({
      shift: 'T1',
      table,
      qty: 6,
      reservationId: r1,
      startAt: at('2026-08-01', '15:00'),
      endAt: at('2026-08-01', '17:00'),
      shared: false,
    })),
    // Una mesa bloqueada a mano.
    {
      shift: 'T1',
      table: 'G1',
      qty: 0,
      shared: false,
      label: 'Taller mensual',
    },
    // Otro grupo en el turno 2.
    {
      shift: 'T2',
      table: 'M1',
      qty: 2,
      reservationId: r2,
      startAt: at('2026-08-01', '17:50'),
      endAt: at('2026-08-01', '19:50'),
      shared: false,
    },
  ];

  const rows = [
    {
      _id: r1,
      code: 'MIS482',
      customerName: 'Agustina Pérez',
      quantity: 6,
      experienceName: 'Arte & Degustación',
      status: 'CONFIRMED',
    },
    {
      _id: r2,
      code: 'MIS777',
      customerName: 'Diego Rossi',
      quantity: 2,
      experienceName: 'Cerámica & Brunch',
      status: 'CONFIRMED',
    },
  ];

  it('agrupa las mesas de una reserva en un solo renglón', async () => {
    const service = await build(dayModelMock(slots), rows);
    const agenda = await service.dayAgenda('2026-08-01');

    const t1 = agenda.find((s) => s.key === 'T1')!;
    expect(t1.reservations).toHaveLength(1);
    expect(t1.reservations[0]).toMatchObject({
      customerName: 'Agustina Pérez',
      code: 'MIS482',
      qty: 6,
      tables: ['M1', 'M2', 'M3'],
      shared: false,
    });
  });

  it('separa los turnos', async () => {
    const service = await build(dayModelMock(slots), rows);
    const agenda = await service.dayAgenda('2026-08-01');
    expect(agenda.map((s) => s.key)).toEqual(['T1', 'T2']);
    expect(agenda[1].reservations[0].customerName).toBe('Diego Rossi');
  });

  it('lista los bloqueos manuales aparte de las reservas', async () => {
    const service = await build(dayModelMock(slots), rows);
    const t1 = (await service.dayAgenda('2026-08-01'))[0];
    expect(t1.blocks).toEqual([{ table: 'G1', label: 'Taller mensual' }]);
  });

  it('trae los límites horarios y el tope de grupo que queda', async () => {
    const service = await build(dayModelMock(slots), rows);
    const t1 = (await service.dayAgenda('2026-08-01'))[0];
    expect(t1.start).toBe('15:00');
    expect(t1.end).toBe('17:30');
    expect(t1.startAt).toEqual(at('2026-08-01', '15:00'));
    // Quedan 7 mesas de 2 y la grande G2: entran hasta 9 + 14 = 23.
    expect(t1.remainingPartySize).toBe(23);
  });

  it('no se cae si la reserva ya no existe', async () => {
    const service = await build(dayModelMock(slots), []);
    const t1 = (await service.dayAgenda('2026-08-01'))[0];
    expect(t1.reservations[0].customerName).toBe('(reserva eliminada)');
  });

  it('con el día vacío devuelve los turnos sin reservas', async () => {
    const service = await build(dayModelMock());
    const agenda = await service.dayAgenda('2026-08-01');
    expect(agenda).toHaveLength(2);
    expect(agenda[0].reservations).toEqual([]);
    expect(agenda[0].remainingPartySize).toBe(38);
  });
});

describe('TablesService · reasignación manual', () => {
  const rid = new Types.ObjectId();

  /** Reserva de 4 personas en T1 con M1 y M2 tomadas. */
  function scenario(overrides: Record<string, unknown> = {}) {
    const doc = {
      _id: rid,
      quantity: 4,
      shiftKey: 'T1',
      startAt: at('2026-08-01', '15:00'),
      tableCodes: ['M1', 'M2'],
      sharedTable: false,
      updatedAt: new Date(0),
      save: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    };
    const slots = ['M1', 'M2'].map((table) => ({
      shift: 'T1',
      table,
      qty: 4,
      reservationId: rid,
      shared: false,
    }));
    return { doc, slots };
  }

  async function buildWithDoc(
    day: ReturnType<typeof dayModelMock>,
    doc: Record<string, unknown> | null,
  ) {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TablesService,
        { provide: getModelToken(Table.name), useValue: tableModelMock() },
        { provide: getModelToken(DayOccupancy.name), useValue: day },
        {
          provide: getModelToken(Reservation.name),
          useValue: {
            findById: jest.fn().mockResolvedValue(doc),
            find: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue([]),
              }),
            }),
          },
        },
      ],
    }).compile();
    return moduleRef.get(TablesService);
  }

  it('suma las mesas nuevas antes de soltar las viejas', async () => {
    const { doc, slots } = scenario();
    const day = dayModelMock(slots);
    const service = await buildWithDoc(day, doc);

    // De M1+M2 pasa a M2+M5: se agrega M5 y se saca M1.
    const res = await service.reassign(String(rid), ['M2', 'M5']);

    expect(res.tables).toEqual(['M2', 'M5']);
    // Primero el push guardado de lo nuevo…
    const [addFilter, addUpdate] = callArgs(day);
    expect(addFilter.slots?.$not.$elemMatch).toEqual({
      shift: 'T1',
      table: { $in: ['M5'] },
    });
    expect(addUpdate.$push.slots.$each).toHaveLength(1);
    // …y después el pull de lo que dejó de usar (nunca al revés).
    const [, pullUpdate] = day.updateOne.mock.calls[1] as [
      unknown,
      { $pull: { slots: { table: { $in: string[] } } } },
    ];
    expect(pullUpdate.$pull.slots.table.$in).toEqual(['M1']);
    expect(doc.save).toHaveBeenCalled();
  });

  it('no toca nada si las mesas nuevas están ocupadas', async () => {
    const { doc, slots } = scenario();
    const day = dayModelMock(slots, [{ matchedCount: 0, upsertedCount: 0 }]);
    const service = await buildWithDoc(day, doc);

    await expect(service.reassign(String(rid), ['M2', 'M5'])).rejects.toThrow(
      /ya está ocupada/,
    );
    // Sólo se intentó el push; nunca se soltó la mesa vieja.
    expect(day.updateOne).toHaveBeenCalledTimes(1);
    expect(doc.save).not.toHaveBeenCalled();
  });

  it('rechaza una selección que no alcanza para el grupo', async () => {
    const { doc, slots } = scenario();
    const service = await buildWithDoc(dayModelMock(slots), doc);
    await expect(service.reassign(String(rid), ['M2'])).rejects.toThrow(
      /2 lugares y la reserva es de 4/,
    );
  });

  it('aplica la regla de unión al validar una grande con mesas de 2', async () => {
    // 11 personas: G1 (9 al unir) + M1 = 11 justo.
    const { doc, slots } = scenario({ quantity: 11 });
    const service = await buildWithDoc(dayModelMock(slots), doc);
    const res = await service.reassign(String(rid), ['G1', 'M1']);
    expect(res.seats).toBe(11);
  });

  it('rechaza una mesa que no existe', async () => {
    const { doc, slots } = scenario();
    const service = await buildWithDoc(dayModelMock(slots), doc);
    await expect(service.reassign(String(rid), ['M99'])).rejects.toThrow(
      /no existe/,
    );
  });

  it('rechaza una reserva sin turno asignado', async () => {
    const { doc, slots } = scenario({ shiftKey: undefined });
    const service = await buildWithDoc(dayModelMock(slots), doc);
    await expect(service.reassign(String(rid), ['M1'])).rejects.toThrow(
      /no tiene turno/,
    );
  });

  it('rechaza una reserva inexistente', async () => {
    const service = await buildWithDoc(dayModelMock(), null);
    await expect(service.reassign(String(rid), ['M1'])).rejects.toThrow(
      /no encontrada/,
    );
  });
});

describe('TablesService · liberación', () => {
  it('libera todas las mesas de la reserva de ese día', async () => {
    const day = dayModelMock();
    const service = await build(day);
    const id = new Types.ObjectId();

    await service.release(id, at('2026-08-01', '15:00'));

    expect(day.updateMany).toHaveBeenCalledWith(
      { date: '2026-08-01' },
      { $pull: { slots: { reservationId: id } } },
    );
  });

  it('acota la liberación a un turno cuando se lo piden', async () => {
    const day = dayModelMock();
    const service = await build(day);
    const id = new Types.ObjectId();

    await service.release(id, at('2026-08-01', '15:00'), 'T1');

    expect(day.updateMany).toHaveBeenCalledWith(
      { date: '2026-08-01' },
      { $pull: { slots: { reservationId: id, shift: 'T1' } } },
    );
  });
});

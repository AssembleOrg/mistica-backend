import { BadRequestException, ConflictException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { DateTime } from 'luxon';
import { Types } from 'mongoose';
import { DayOccupancy } from '../common/schemas/day-occupancy.schema';
import { ExperienceSession } from '../common/schemas/experience-session.schema';
import { Reservation } from '../common/schemas/reservation.schema';
import { Table } from '../common/schemas/table.schema';
import { RecurringBlocksService } from './recurring-blocks.service';
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

/** Slot de ocupación con horas locales (limpieza de 10 min por defecto). */
function slotAt(
  table: string,
  startHH: string,
  endHH: string,
  extra: Record<string, unknown> = {},
  dateKey = '2026-08-01',
): Record<string, unknown> {
  const endAt = at(dateKey, endHH);
  return {
    table,
    qty: 2,
    startAt: at(dateKey, startHH),
    endAt,
    busyUntil: new Date(endAt.getTime() + 10 * 60_000),
    shared: false,
    ...extra,
  };
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

/** Turnos de reserva: reassign lo consulta para conocer la duración. */
function sessionModelMock(session: Record<string, unknown> | null = null) {
  return {
    findById: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(session),
      }),
    }),
  };
}

/** Bloqueos fijos: por defecto no hay ninguno. */
function recurringMock(rules: Record<string, unknown>[] = []) {
  return { forDate: jest.fn().mockReturnValue(rules) };
}

async function build(
  dayModel: ReturnType<typeof dayModelMock>,
  reservations: Record<string, unknown>[] = [],
  recurring: Record<string, unknown>[] = [],
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
      {
        provide: getModelToken(ExperienceSession.name),
        useValue: sessionModelMock(),
      },
      { provide: RecurringBlocksService, useValue: recurringMock(recurring) },
    ],
  }).compile();
  return moduleRef.get(TablesService);
}

describe('TablesService · disponibilidad por intervalos', () => {
  const interval = (service: TablesService, startHH: string, dur = 120) =>
    service.intervalFor(at('2026-08-01', startHH), dur);

  it('con el día vacío están todas las mesas libres', async () => {
    const service = await build(dayModelMock());
    const free = await service.freeTablesFor(interval(service, '15:00'));
    expect(free.small).toHaveLength(10);
    expect(free.large).toEqual(['G1', 'G2']);
    expect(free.shareableLarge).toEqual([]);
  });

  it('descuenta las mesas cuyo intervalo se pisa', async () => {
    const service = await build(
      dayModelMock([
        slotAt('M1', '15:00', '17:00', { reservationId: new Types.ObjectId() }),
        slotAt('M2', '15:00', '17:00', { reservationId: new Types.ObjectId() }),
      ]),
    );
    const free = await service.freeTablesFor(interval(service, '16:30'));
    expect(free.small).not.toContain('M1');
    expect(free.small).not.toContain('M2');
    expect(free.small).toHaveLength(8);
  });

  it('las mesas de un horario que no se pisa no cuentan', async () => {
    const service = await build(
      dayModelMock([
        slotAt('M1', '17:50', '19:50', { reservationId: new Types.ObjectId() }),
      ]),
    );
    const free = await service.freeTablesFor(interval(service, '15:00'));
    expect(free.small).toHaveLength(10);
  });

  it('la limpieza bloquea la mesa 10 minutos después del fin', async () => {
    const service = await build(
      dayModelMock([
        // Ocupada 15:00–17:00, limpia hasta 17:10.
        slotAt('M1', '15:00', '17:00', { reservationId: new Types.ObjectId() }),
      ]),
    );
    // A las 17:00 la mesa todavía está tomada (limpieza).
    const clash = await service.freeTablesFor(interval(service, '17:00'));
    expect(clash.small).not.toContain('M1');
    // A las 17:10 ya se puede volver a usar.
    const free = await service.freeTablesFor(interval(service, '17:10'));
    expect(free.small).toContain('M1');
  });

  it('la limpieza de la reserva NUEVA también cuenta contra las siguientes', async () => {
    const service = await build(
      dayModelMock([
        // Ocupada 17:30–19:30.
        slotAt('M1', '17:30', '19:30', { reservationId: new Types.ObjectId() }),
      ]),
    );
    // Nueva 15:25–17:25 + limpieza hasta 17:35 → pisa a la de 17:30.
    const clash = await service.freeTablesFor(interval(service, '15:25'));
    expect(clash.small).not.toContain('M1');
    // Nueva 15:20–17:20 + limpieza hasta 17:30 → justo no pisa.
    const free = await service.freeTablesFor(interval(service, '15:20'));
    expect(free.small).toContain('M1');
  });

  it('un slot legacy sin horas bloquea la mesa todo el día', async () => {
    const service = await build(
      dayModelMock([
        { shift: 'T1', table: 'M1', qty: 2, reservationId: new Types.ObjectId() },
      ]),
    );
    const free = await service.freeTablesFor(interval(service, '18:00'));
    expect(free.small).not.toContain('M1');
  });

  it('una grande con un solo grupo queda como compartible, no como libre', async () => {
    const holder = new Types.ObjectId();
    const service = await build(
      dayModelMock([
        slotAt('G1', '15:00', '17:00', { qty: 4, reservationId: holder }),
      ]),
    );
    const free = await service.freeTablesFor(interval(service, '15:00'));
    expect(free.large).toEqual(['G2']);
    expect(free.shareableLarge).toEqual([
      { code: 'G1', holderQty: 4, holderReservationId: String(holder) },
    ]);
  });

  it('una grande bloqueada a mano no se puede compartir', async () => {
    const service = await build(
      dayModelMock([
        slotAt('G1', '15:00', '20:00', { qty: 0, label: 'Taller mensual' }),
      ]),
    );
    const free = await service.freeTablesFor(interval(service, '15:00'));
    expect(free.large).toEqual(['G2']);
    expect(free.shareableLarge).toEqual([]);
  });

  it('remainingPartySize es el grupo más grande que entra, no la suma de asientos', async () => {
    // Quedan 3 mesas de 2 y ninguna grande: el tope de UNA reserva es 6.
    const busy = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'G1', 'G2'].map(
      (table) =>
        slotAt(table, '15:00', '17:00', {
          reservationId: new Types.ObjectId(),
        }),
    );
    const service = await build(dayModelMock(busy));
    expect(
      await service.remainingPartySize(at('2026-08-01', '15:00'), 120),
    ).toBe(6);
  });
});

describe('TablesService · asignación atómica', () => {
  it('escribe todas las mesas en una sola operación guardada por intervalo', async () => {
    const day = dayModelMock();
    const service = await build(day);
    const reservationId = new Types.ObjectId();

    const assignment = await service.assign({
      reservationId,
      qty: 4,
      startAt: at('2026-08-01', '15:00'),
      durationMinutes: 120,
    });

    expect(assignment.dateKey).toBe('2026-08-01');
    expect(assignment.tables.map((t) => t.code)).toEqual(['M1', 'M2']);
    expect(assignment.shared).toBe(false);

    expect(day.updateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = callArgs(day);
    // La guarda impide que las mesas del plan tengan un slot que pise el
    // intervalo (con la limpieza incluida).
    const busyUntil = new Date(at('2026-08-01', '17:00').getTime() + 10 * 60_000);
    expect(filter).toEqual({
      date: '2026-08-01',
      slots: {
        $not: {
          $elemMatch: {
            table: { $in: ['M1', 'M2'] },
            startAt: { $lt: busyUntil },
            busyUntil: { $gt: at('2026-08-01', '15:00') },
          },
        },
      },
    });
    // Y el push mete las dos mesas juntas: todo o nada.
    expect(update.$push.slots.$each).toHaveLength(2);
    expect(update.$push.slots.$each[0]).toMatchObject({
      table: 'M1',
      startAt: at('2026-08-01', '15:00'),
      endAt: at('2026-08-01', '17:00'),
      busyUntil,
    });
  });

  it('acepta un horario que rompe los turnos sugeridos (16:30)', async () => {
    const day = dayModelMock();
    const service = await build(day);

    const assignment = await service.assign({
      reservationId: new Types.ObjectId(),
      qty: 2,
      startAt: at('2026-08-01', '16:30'),
      durationMinutes: 120,
    });
    expect(assignment.tables.map((t) => t.code)).toEqual(['M1']);
    const [, update] = callArgs(day);
    expect(update.$push.slots.$each[0]).toMatchObject({
      endAt: at('2026-08-01', '18:30'),
    });
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
    const busy = TABLE_ROWS.map((t) =>
      slotAt(t.code, '15:00', '17:00', {
        reservationId: new Types.ObjectId(),
      }),
    );
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
      ...TABLE_ROWS.filter((t) => t.kind === 'SMALL').map((t) =>
        slotAt(t.code, '15:00', '17:00', {
          reservationId: new Types.ObjectId(),
        }),
      ),
      slotAt('G1', '15:00', '17:00', { qty: 4, reservationId: holder }),
      slotAt('G2', '15:00', '17:00', {
        qty: 10,
        reservationId: new Types.ObjectId(),
      }),
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
      reservationId: holder,
      qty: { $lte: 4 },
    });
  });
});

describe('TablesService · ventana del negocio', () => {
  it('rechaza terminar después del cierre y sugiere el último inicio', async () => {
    const service = await build(dayModelMock());
    await expect(
      service.assign({
        reservationId: new Types.ObjectId(),
        qty: 2,
        startAt: at('2026-08-01', '18:30'),
        durationMinutes: 120,
      }),
    ).rejects.toThrow(/después del cierre/);
  });

  it('rechaza empezar antes de la apertura', async () => {
    const service = await build(dayModelMock());
    await expect(
      service.assign({
        reservationId: new Types.ObjectId(),
        qty: 2,
        startAt: at('2026-08-01', '14:00'),
        durationMinutes: 120,
      }),
    ).rejects.toThrow(/antes de la apertura/);
  });

  it('avisa cuando la experiencia no entra en el horario del salón', async () => {
    const service = await build(dayModelMock());
    await expect(
      service.assign({
        reservationId: new Types.ObjectId(),
        qty: 2,
        startAt: at('2026-08-01', '15:00'),
        durationMinutes: 360,
      }),
    ).rejects.toThrow(/no entra en el horario del salón/);
  });

  it('intervalFor calcula fin y limpieza', async () => {
    const service = await build(dayModelMock());
    const i = service.intervalFor(at('2026-08-01', '16:30'), 120);
    expect(i.dateKey).toBe('2026-08-01');
    expect(i.endAt).toEqual(at('2026-08-01', '18:30'));
    expect(i.busyUntil).toEqual(at('2026-08-01', '18:40'));
  });

  it('intervalFor explota con un horario imposible', async () => {
    const service = await build(dayModelMock());
    expect(() => service.intervalFor(at('2026-08-01', '19:00'), 120)).toThrow(
      BadRequestException,
    );
  });
});

describe('TablesService · agenda del día', () => {
  const r1 = new Types.ObjectId();
  const r2 = new Types.ObjectId();

  const slots = [
    // Un grupo de 6 con tres mesas de 2 a las 15:00.
    ...['M1', 'M2', 'M3'].map((table) =>
      slotAt(table, '15:00', '17:00', { qty: 6, reservationId: r1 }),
    ),
    // Una mesa bloqueada a mano todo el día.
    slotAt('G1', '15:00', '20:00', {
      qty: 0,
      label: 'Taller mensual',
      busyUntil: at('2026-08-01', '20:00'),
    }),
    // Otro grupo con un horario "roto" (17:20, cruza los turnos sugeridos).
    slotAt('M1', '17:20', '19:20', { qty: 2, reservationId: r2 }),
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

    const grupo = agenda.reservations.find((r) => r.code === 'MIS482')!;
    expect(grupo).toMatchObject({
      customerName: 'Agustina Pérez',
      qty: 6,
      tables: ['M1', 'M2', 'M3'],
      shared: false,
    });
  });

  it('ordena las reservas por hora y trae la ventana del día', async () => {
    const service = await build(dayModelMock(slots), rows);
    const agenda = await service.dayAgenda('2026-08-01');
    expect(agenda.open).toBe('15:00');
    expect(agenda.close).toBe('20:00');
    expect(agenda.cleaningMinutes).toBe(10);
    expect(agenda.reservations.map((r) => r.code)).toEqual([
      'MIS482',
      'MIS777',
    ]);
    expect(agenda.suggestedShifts.map((s) => s.key)).toEqual(['T1', 'T2']);
  });

  it('una mesa con dos usos en el día muestra los dos holders en orden', async () => {
    const service = await build(dayModelMock(slots), rows);
    const agenda = await service.dayAgenda('2026-08-01');
    const m1 = agenda.tables.find((t) => t.code === 'M1')!;
    expect(m1.holders).toHaveLength(2);
    expect(m1.holders[0].startAt).toEqual(at('2026-08-01', '15:00'));
    expect(m1.holders[1].startAt).toEqual(at('2026-08-01', '17:20'));
  });

  it('lista los bloqueos manuales aparte de las reservas', async () => {
    const service = await build(dayModelMock(slots), rows);
    const agenda = await service.dayAgenda('2026-08-01');
    expect(agenda.blocks).toEqual([
      {
        table: 'G1',
        label: 'Taller mensual',
        startAt: at('2026-08-01', '15:00'),
        endAt: at('2026-08-01', '20:00'),
      },
    ]);
  });

  it('no se cae si la reserva ya no existe', async () => {
    const service = await build(dayModelMock(slots), []);
    const agenda = await service.dayAgenda('2026-08-01');
    expect(agenda.reservations[0].customerName).toBe('(reserva eliminada)');
  });

  it('con el día vacío devuelve las mesas libres', async () => {
    const service = await build(dayModelMock());
    const agenda = await service.dayAgenda('2026-08-01');
    expect(agenda.reservations).toEqual([]);
    expect(agenda.tables.every((t) => !t.occupied)).toBe(true);
  });
});

describe('TablesService · reasignación manual', () => {
  const rid = new Types.ObjectId();

  /** Reserva de 4 personas 15:00–17:00 con M1 y M2 tomadas. */
  function scenario(overrides: Record<string, unknown> = {}) {
    const doc = {
      _id: rid,
      quantity: 4,
      startAt: at('2026-08-01', '15:00'),
      tableCodes: ['M1', 'M2'],
      sharedTable: false,
      updatedAt: new Date(0),
      save: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    };
    const slots = ['M1', 'M2'].map((table) =>
      slotAt(table, '15:00', '17:00', { qty: 4, reservationId: rid }),
    );
    return { doc, slots };
  }

  async function buildWithDoc(
    day: ReturnType<typeof dayModelMock>,
    doc: Record<string, unknown> | null,
    session: Record<string, unknown> | null = { durationMinutes: 120 },
    recurring: Record<string, unknown>[] = [],
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
        {
          provide: getModelToken(ExperienceSession.name),
          useValue: sessionModelMock(session),
        },
        {
          provide: RecurringBlocksService,
          useValue: recurringMock(recurring),
        },
      ],
    }).compile();
    return moduleRef.get(TablesService);
  }

  it('suma las mesas nuevas antes de soltar las viejas', async () => {
    const { doc, slots } = scenario({ sessionId: new Types.ObjectId() });
    const day = dayModelMock(slots);
    const service = await buildWithDoc(day, doc);

    // De M1+M2 pasa a M2+M5: se agrega M5 y se saca M1.
    const res = await service.reassign(String(rid), ['M2', 'M5']);

    expect(res.tables).toEqual(['M2', 'M5']);
    // Primero el push guardado de lo nuevo…
    const [addFilter, addUpdate] = callArgs(day);
    expect(addFilter.slots?.$not.$elemMatch).toMatchObject({
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

  it('sin sesión, usa el horario de los slots existentes', async () => {
    const { doc, slots } = scenario(); // sin sessionId
    const day = dayModelMock(slots);
    const service = await buildWithDoc(day, doc, null);

    const res = await service.reassign(String(rid), ['M2', 'M5']);
    expect(res.tables).toEqual(['M2', 'M5']);
    const [, addUpdate] = callArgs(day);
    expect(addUpdate.$push.slots.$each[0]).toMatchObject({
      startAt: at('2026-08-01', '15:00'),
      endAt: at('2026-08-01', '17:00'),
    });
  });

  it('no toca nada si las mesas nuevas están ocupadas', async () => {
    const { doc, slots } = scenario({ sessionId: new Types.ObjectId() });
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
    const { doc, slots } = scenario({ sessionId: new Types.ObjectId() });
    const service = await buildWithDoc(dayModelMock(slots), doc);
    await expect(service.reassign(String(rid), ['M2'])).rejects.toThrow(
      /2 lugares y la reserva es de 4/,
    );
  });

  it('aplica la regla de unión al validar una grande con mesas de 2', async () => {
    // 11 personas: G1 (9 al unir) + M1 = 11 justo.
    const { doc, slots } = scenario({
      quantity: 11,
      sessionId: new Types.ObjectId(),
    });
    const service = await buildWithDoc(dayModelMock(slots), doc);
    const res = await service.reassign(String(rid), ['G1', 'M1']);
    expect(res.seats).toBe(11);
  });

  it('rechaza una mesa que no existe', async () => {
    const { doc, slots } = scenario({ sessionId: new Types.ObjectId() });
    const service = await buildWithDoc(dayModelMock(slots), doc);
    await expect(service.reassign(String(rid), ['M99'])).rejects.toThrow(
      /no existe/,
    );
  });

  it('rechaza una reserva sin horario determinable', async () => {
    const doc = {
      _id: rid,
      quantity: 2,
      startAt: at('2026-08-01', '15:00'),
      tableCodes: [],
      sharedTable: false,
      updatedAt: new Date(0),
      save: jest.fn().mockResolvedValue(undefined),
    };
    // Sin sessionId y sin slots en el día: no hay de dónde sacar la duración.
    const service = await buildWithDoc(dayModelMock(), doc, null);
    await expect(service.reassign(String(rid), ['M1'])).rejects.toThrow(
      /No se pudo determinar/,
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

  it('acota la liberación a un horario exacto cuando se lo piden', async () => {
    const day = dayModelMock();
    const service = await build(day);
    const id = new Types.ObjectId();
    const start = at('2026-08-01', '15:00');

    await service.release(id, start, start);

    expect(day.updateMany).toHaveBeenCalledWith(
      { date: '2026-08-01' },
      { $pull: { slots: { reservationId: id, startAt: start } } },
    );
  });
});

describe('TablesService · bloqueos fijos semanales', () => {
  // Taller de cerámica: ocupa G1 los sábados de 15:30 a 17:30.
  const TALLER = {
    id: 'rb1',
    label: 'Taller de cerámica',
    weekday: 6, // 2026-08-01 es sábado
    start: '15:30',
    end: '17:30',
    tableCodes: ['G1'],
  };

  it('la mesa del taller no está libre en su horario', async () => {
    const service = await build(dayModelMock(), [], [TALLER]);
    const free = await service.freeTablesFor(
      service.intervalFor(at('2026-08-01', '15:30'), 120),
    );
    expect(free.large).toEqual(['G2']);
    // Un bloqueo no es compartible.
    expect(free.shareableLarge).toEqual([]);
  });

  it('fuera del horario del taller la mesa vuelve al pool', async () => {
    const service = await build(dayModelMock(), [], [TALLER]);
    const free = await service.freeTablesFor(
      service.intervalFor(at('2026-08-01', '17:30'), 120),
    );
    expect(free.large).toEqual(['G1', 'G2']);
  });

  it('baja la disponibilidad máxima del día', async () => {
    const service = await build(dayModelMock(), [], [TALLER]);
    // Sin taller: 9+9+20 = 38. Con G1 tomada: 9 + 20 = 29.
    expect(
      await service.remainingPartySize(at('2026-08-01', '15:30'), 120),
    ).toBe(29);
  });

  it('aparece en la agenda como bloqueo fijo', async () => {
    const service = await build(dayModelMock(), [], [TALLER]);
    const agenda = await service.dayAgenda('2026-08-01');
    expect(agenda.blocks).toEqual([
      expect.objectContaining({
        table: 'G1',
        label: 'Taller de cerámica',
        recurring: true,
        recurringId: 'rb1',
      }),
    ]);
    const g1 = agenda.tables.find((t) => t.code === 'G1')!;
    expect(g1.occupied).toBe(true);
    expect(g1.holders[0]).toMatchObject({ recurring: true, qty: 0 });
  });

  it('un bloqueo manual no puede pisar el bloqueo fijo', async () => {
    const service = await build(dayModelMock(), [], [TALLER]);
    await expect(
      service.blockTable({
        dateKey: '2026-08-01',
        code: 'G1',
        label: 'Evento',
        start: '16:00',
        end: '18:00',
      }),
    ).rejects.toThrow(/bloqueo fijo/);
  });

  it('la reasignación manual tampoco', async () => {
    const rid2 = new Types.ObjectId();
    const doc = {
      _id: rid2,
      quantity: 8,
      startAt: at('2026-08-01', '15:30'),
      tableCodes: ['M1', 'M2', 'M3', 'M4'],
      sharedTable: false,
      sessionId: new Types.ObjectId(),
      updatedAt: new Date(0),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const slots = ['M1', 'M2', 'M3', 'M4'].map((table) =>
      slotAt(table, '15:30', '17:30', { qty: 8, reservationId: rid2 }),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        TablesService,
        { provide: getModelToken(Table.name), useValue: tableModelMock() },
        { provide: getModelToken(DayOccupancy.name), useValue: dayModelMock(slots) },
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
        {
          provide: getModelToken(ExperienceSession.name),
          useValue: sessionModelMock({ durationMinutes: 120 }),
        },
        { provide: RecurringBlocksService, useValue: recurringMock([TALLER]) },
      ],
    }).compile();
    const service = moduleRef.get(TablesService);
    await expect(service.reassign(String(rid2), ['G1'])).rejects.toThrow(
      /bloqueo fijo/,
    );
  });
});

describe('TablesService · bloqueos manuales', () => {
  it('sin horas bloquea la ventana completa del día', async () => {
    const day = dayModelMock();
    const service = await build(day);

    await service.blockTable({
      dateKey: '2026-08-01',
      code: 'G1',
      label: 'Taller mensual',
    });

    const [, update] = callArgs(day);
    expect(update.$push.slots.$each[0]).toMatchObject({
      table: 'G1',
      qty: 0,
      label: 'Taller mensual',
      startAt: at('2026-08-01', '15:00'),
      endAt: at('2026-08-01', '20:00'),
      busyUntil: at('2026-08-01', '20:00'),
    });
  });

  it('con horas bloquea sólo ese rango', async () => {
    const day = dayModelMock();
    const service = await build(day);

    await service.blockTable({
      dateKey: '2026-08-01',
      code: 'M1',
      label: 'Mesa rota',
      start: '16:00',
      end: '18:00',
    });

    const [, update] = callArgs(day);
    expect(update.$push.slots.$each[0]).toMatchObject({
      startAt: at('2026-08-01', '16:00'),
      endAt: at('2026-08-01', '18:00'),
    });
  });

  it('rechaza un rango invertido', async () => {
    const service = await build(dayModelMock());
    await expect(
      service.blockTable({
        dateKey: '2026-08-01',
        code: 'M1',
        label: 'Mesa rota',
        start: '18:00',
        end: '16:00',
      }),
    ).rejects.toThrow(/termina antes de empezar/);
  });

  it('avisa si la mesa ya está ocupada en ese rango', async () => {
    const day = dayModelMock([], [{ matchedCount: 0, upsertedCount: 0 }]);
    const service = await build(day);
    await expect(
      service.blockTable({
        dateKey: '2026-08-01',
        code: 'M1',
        label: 'Mesa rota',
      }),
    ).rejects.toThrow(/ya está ocupada/);
  });
});

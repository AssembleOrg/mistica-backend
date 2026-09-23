import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { DateTime } from 'luxon';
import { DayOccupancy } from '../common/schemas/day-occupancy.schema';
import { ExperienceSession } from '../common/schemas/experience-session.schema';
import { Reservation } from '../common/schemas/reservation.schema';
import { Table } from '../common/schemas/table.schema';
import { RecurringBlocksService } from '../tables/recurring-blocks.service';
import { TablesService } from '../tables/tables.service';
import { AvailabilityService } from './availability.service';

/**
 * Inicio ANTICIPADO del turno 2 con las mesas REALES (TablesService con la
 * ocupación por intervalo + limpieza). Sólo se mockea la base.
 *
 * Turno 1 15:00–17:30 y Turno 2 17:40–20:00: el hueco de 10' es la limpieza de
 * las mesas usadas en el Turno 1. Las que no se usaron están libres a las
 * 17:30, así que el Turno 2 se puede arrancar ahí mismo si hay lugar.
 */

const TZ = 'America/Argentina/Buenos_Aires';
const T1 = { key: 'T1', name: 'Turno 1', start: '15:00', end: '17:30' };
const T2 = { key: 'T2', name: 'Turno 2', start: '17:40', end: '20:00' };
const EXP_ID = '66aa00000000000000000001';

// Salón real: 10 mesas de 2 + 2 grandes de 10 (40 lugares).
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

// Un día dentro del horizonte de 6 meses (la disponibilidad no mira el pasado).
const DAY = DateTime.now().setZone(TZ).plus({ days: 7 }).toISODate() as string;

function at(hhmm: string): Date {
  return DateTime.fromISO(`${DAY}T${hhmm}`, { zone: TZ }).toJSDate();
}

/** Mesa ocupada de `startHH` a `endHH`, con 10' de limpieza. */
function busy(table: string, startHH: string, endHH: string) {
  const endAt = at(endHH);
  return {
    table,
    qty: 2,
    startAt: at(startHH),
    endAt,
    busyUntil: new Date(endAt.getTime() + 10 * 60_000),
    shared: false,
  };
}

async function build(slots: Record<string, unknown>[], durationMinutes = 120) {
  const tablesRef = await Test.createTestingModule({
    providers: [
      TablesService,
      {
        provide: getModelToken(Table.name),
        useValue: {
          find: () => ({
            select: () => ({ sort: () => ({ lean: async () => TABLE_ROWS }) }),
          }),
        },
      },
      {
        provide: getModelToken(DayOccupancy.name),
        useValue: {
          findOne: () => ({
            lean: async () => (slots.length ? { slots } : null),
          }),
        },
      },
      {
        provide: getModelToken(Reservation.name),
        useValue: {
          find: () => ({ select: () => ({ lean: async () => [] }) }),
        },
      },
      {
        provide: getModelToken(ExperienceSession.name),
        useValue: {
          findById: () => ({ select: () => ({ lean: async () => null }) }),
        },
      },
      { provide: RecurringBlocksService, useValue: { forDate: () => [] } },
    ],
  }).compile();

  const exp = {
    _id: EXP_ID,
    name: 'Experiencia',
    isActive: true,
    bookableOnline: true,
    durationMinutes,
    basePrice: 42000,
    depositPct: 50,
    defaultCapacity: 40,
  };
  const experienceModel = { findById: () => ({ exec: async () => exp }) };
  const sessionModel = {
    findOne: () => ({ select: () => ({ lean: async () => null }) }),
  };
  const shifts = { forDate: () => [T1, T2] };
  const closedDates = { isClosed: async () => ({ closed: false }) };

  return new AvailabilityService(
    experienceModel as never,
    sessionModel as never,
    shifts as never,
    tablesRef.get(TablesService),
    closedDates as never,
  );
}

const offer = (service: AvailabilityService, includeFull = false) =>
  service.forExperience({
    experienceId: EXP_ID,
    from: DAY,
    to: DAY,
    includeFull,
  });

describe('AvailabilityService · inicio anticipado del turno', () => {
  it('ofrece arrancar el Turno 2 a las 17:30 si el Turno 1 no llenó el salón', async () => {
    // Turno 1 con una sola mesa grande usada (10 de 40 lugares).
    const service = await build([busy('G1', '15:00', '17:30')]);
    const slots = await offer(service);

    expect(slots.map((s) => s.startTime)).toEqual(['15:00', '17:30', '17:40']);
    const early = slots.find((s) => s.startTime === '17:30');
    expect(early?.earlyStart).toBe(true);
    expect(early?.shiftKey).toBe('T2');
    // Sólo cuentan las mesas que el Turno 1 no usó: la G1 sigue en limpieza,
    // así que a las 17:30 entra un grupo más chico que a las 17:40.
    const normal = slots.find((s) => s.startTime === '17:40');
    expect(early?.maxPartySize).toBeGreaterThan(0);
    expect(early?.maxPartySize).toBeLessThan(normal?.maxPartySize ?? 0);
    // El inicio normal no lleva la marca.
    expect(normal?.earlyStart).toBeUndefined();
  });

  it('no lo ofrece si todas las mesas se usaron en el Turno 1', async () => {
    const all = TABLE_ROWS.map((t) => busy(t.code, '15:00', '17:30'));
    const slots = await offer(await build(all));

    expect(slots.map((s) => s.startTime)).toEqual(['17:40']);
  });

  it('una mesa que el Turno 1 liberó antes (y ya se limpió) también cuenta', async () => {
    // Una experiencia de 2 h del Turno 1 termina 17:00 y se limpia a las 17:10:
    // a las 17:30 esa mesa ya está lista.
    const all = TABLE_ROWS.map((t) =>
      t.code === 'M1' ? busy('M1', '15:00', '17:00') : busy(t.code, '15:00', '17:30'),
    );
    const slots = await offer(await build(all));

    const early = slots.find((s) => s.startTime === '17:30');
    expect(early?.maxPartySize).toBe(2);
  });

  it('con includeFull el anticipado sin lugar no aparece como agotado', async () => {
    const all = TABLE_ROWS.map((t) => busy(t.code, '15:00', '20:00'));
    const slots = await offer(await build(all), true);

    expect(slots.map((s) => s.startTime)).toEqual(['15:00', '17:40']);
    expect(slots.every((s) => s.maxPartySize === 0)).toBe(true);
  });

  it('una experiencia que no entra a las 17:40 sí puede entrar arrancando 17:30', async () => {
    // 2:30 h: 17:40 + 150' = 20:10 (pasa el cierre); 17:30 + 150' = 20:00.
    const slots = await offer(await build([], 150));

    expect(slots.map((s) => s.startTime)).toEqual(['15:00', '17:30']);
    expect(slots[1].earlyStart).toBe(true);
  });

  it('el Turno 1 no tiene inicio anticipado', async () => {
    const slots = await offer(await build([]));
    expect(slots.filter((s) => s.shiftKey === 'T1').map((s) => s.startTime)).toEqual([
      '15:00',
    ]);
  });
});

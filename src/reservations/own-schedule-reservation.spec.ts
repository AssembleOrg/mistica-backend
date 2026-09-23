import { DateTime } from 'luxon';
import { ReservationsService } from './reservations.service';

/**
 * Reservas en el HORARIO PROPIO de una experiencia (Escuelita: miércoles 18:00,
 * cupo 7): la capacidad es el cupo y NO se usan mesas (el lugar físico lo
 * aparta un bloqueo semanal). Fuera de su horario propio, el flujo de mesas de
 * siempre.
 */

const TZ = 'America/Argentina/Buenos_Aires';
const EXP_ID = '66aa00000000000000000fbb';
const MIERCOLES = '2026-09-30';
const JUEVES = '2026-10-01';

const ESCUELITA = {
  _id: EXP_ID,
  name: 'Escuelita de arte',
  basePrice: 10000,
  depositPct: 50,
  durationMinutes: 105,
  defaultCapacity: 7,
  priceVariants: [],
  ownSchedule: [{ weekday: 3, start: '18:00' }],
};

function at(dateKey: string, hhmm: string): Date {
  return DateTime.fromISO(`${dateKey}T${hhmm}`, { zone: TZ }).toJSDate();
}

function build(seatsTaken = 0) {
  const tables = {
    previewAssignment: jest.fn().mockResolvedValue({
      fits: true,
      suggestedShiftKey: 'T2',
      plan: { tables: [{ code: 'M1' }], shared: false },
    }),
    remainingPartySize: jest.fn().mockResolvedValue(20),
    venueMaxParty: jest.fn().mockResolvedValue(40),
    assign: jest.fn().mockResolvedValue({ tables: [{ code: 'M1' }], shared: false }),
  };
  const experienceModel = {
    findById: () => ({ select: () => ({ lean: async () => ESCUELITA }) }),
  };
  const sessionModel = {
    findOne: () => ({
      lean: async () => (seatsTaken ? { capacity: 7, seatsTaken, price: 10000 } : null),
    }),
  };
  const availability = {
    slotOrThrow: jest.fn(async (_id: string, date: string, time: string) => ({
      startAt: at(date, time),
      startKey: time,
      durationMinutes: 105,
      capacity: 7,
    })),
  };
  const service = new ReservationsService(
    {} as never, // reservationModel
    sessionModel as never,
    {} as never, // paymentModel
    {} as never, // productModel
    experienceModel as never,
    {} as never, // mercadopago
    {} as never, // cashbox
    {} as never, // salesService
    {} as never, // notifications
    {} as never, // closedDates
    tables as never,
    availability as never,
  );
  return { service, tables };
}

const preview = (service: ReservationsService, date: string, time: string, quantity: number) =>
  service.previewTables({ experienceId: EXP_ID, date, startTime: time, quantity });

describe('Reservas en el horario propio de una experiencia', () => {
  it('en su horario propio entra por cupo, sin mirar las mesas', async () => {
    const { service, tables } = build();
    const r = (await preview(service, MIERCOLES, '18:00', 3)) as Record<string, any>;

    expect(r.fits).toBe(true);
    expect(r.tables).toEqual([]);
    expect(r.maxPartySize).toBe(7);
    expect(r.pricing.totalAmount).toBe(30000);
    expect(tables.previewAssignment).not.toHaveBeenCalled();
    expect(tables.remainingPartySize).not.toHaveBeenCalled();
  });

  it('más gente que el cupo no entra', async () => {
    const { service } = build(5); // ya hay 5 anotados de 7
    const r = (await preview(service, MIERCOLES, '18:00', 3)) as Record<string, any>;

    expect(r.fits).toBe(false);
    expect(r.maxPartySize).toBe(2);
  });

  it('fuera de su horario propio usa las mesas como siempre', async () => {
    const { service, tables } = build();
    await preview(service, JUEVES, '18:00', 3);
    expect(tables.previewAssignment).toHaveBeenCalledTimes(1);
  });

  it('una reserva en su horario propio no toma mesas', async () => {
    const { service, tables } = build();
    const reservation = { _id: 'r1', quantity: 3, save: jest.fn() };
    const session = { experienceId: EXP_ID, startAt: at(MIERCOLES, '18:00'), durationMinutes: 105 };

    await (service as any).attachTables(reservation, session);

    expect(tables.assign).not.toHaveBeenCalled();
  });

  it('fuera de su horario propio sí se asignan mesas', async () => {
    const { service, tables } = build();
    const reservation = { _id: 'r1', quantity: 3, save: jest.fn() };
    const session = { experienceId: EXP_ID, startAt: at(JUEVES, '18:00'), durationMinutes: 105 };

    await (service as any).attachTables(reservation, session);

    expect(tables.assign).toHaveBeenCalledTimes(1);
  });
});

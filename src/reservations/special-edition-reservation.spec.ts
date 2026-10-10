import { DateTime } from 'luxon';
import { ReservationsService } from './reservations.service';

/**
 * Reservas en una EDICIÓN ESPECIAL de la experiencia (Halloween, Navidad):
 * esos días rigen el precio y los bonos de la edición — las promos habituales
 * no participan —, la reserva queda rotulada con la edición y, si la edición
 * tiene horarios propios, el lugar es el cupo (sin mesas).
 */

const TZ = 'America/Argentina/Buenos_Aires';
const EXP_ID = '66aa00000000000000000abc';
const DIA_NORMAL = '2026-10-20';
const HALLOWEEN = '2026-10-31';
const NAVIDAD = '2026-12-20';

const AYD = {
  _id: EXP_ID,
  name: 'Arte & Degustación',
  basePrice: 42000,
  depositPct: 50,
  durationMinutes: 120,
  defaultCapacity: 20,
  ownSchedule: [],
  // Promo habitual: 5 o más pagan menos.
  priceVariants: [
    {
      name: 'Grupo de 5 o más',
      unit: 'PER_PERSON',
      price: 38000,
      minQty: 5,
      active: true,
    },
  ],
  specials: [
    {
      _id: 'sp-halloween',
      name: 'Especial Halloween',
      aliases: ['halloween'],
      dateFrom: '2026-10-30',
      dateTo: '2026-11-01',
      price: 60000,
      // Bono de la edición: de 4 en adelante, un lugar bonificado.
      priceVariants: [
        {
          name: 'Vení de a 4',
          unit: 'PER_PERSON',
          minQty: 4,
          freeSpots: 1,
          active: true,
        },
      ],
      active: true,
    },
    {
      _id: 'sp-navidad',
      name: 'Especial Navidad',
      aliases: ['navidad'],
      dateFrom: '2026-12-19',
      dateTo: '2026-12-23',
      // Sin precio propio (vale el de la experiencia) y con horario especial.
      schedule: [{ start: '16:00' }],
      priceVariants: [],
      active: true,
    },
  ],
};

function at(dateKey: string, hhmm: string): Date {
  return DateTime.fromISO(`${dateKey}T${hhmm}`, { zone: TZ }).toJSDate();
}

function build() {
  const tables = {
    previewAssignment: jest.fn().mockResolvedValue({
      fits: true,
      suggestedShiftKey: 'T1',
      plan: { tables: [{ code: 'M1' }], shared: false },
    }),
    remainingPartySize: jest.fn().mockResolvedValue(20),
    venueMaxParty: jest.fn().mockResolvedValue(40),
  };
  const experienceModel = {
    findById: () => ({ select: () => ({ lean: async () => AYD }) }),
  };
  const sessionModel = { findOne: () => ({ lean: async () => null }) };
  const reservationModel = {
    create: jest.fn(async (doc: Record<string, unknown>) => doc),
  };
  const availability = {
    slotOrThrow: jest.fn(async (_id: string, date: string, time: string) => ({
      startAt: at(date, time),
      startKey: time,
      durationMinutes: 120,
      capacity: 20,
    })),
  };
  const service = new ReservationsService(
    reservationModel as never,
    sessionModel as never,
    {} as never, // paymentModel
    {} as never, // productModel
    experienceModel as never,
    {} as never, // saleModel
    {} as never, // mercadopago
    {} as never, // cashbox
    {} as never, // salesService
    {} as never, // notifications
    {} as never, // closedDates
    tables as never,
    availability as never,
  );
  return { service, tables, reservationModel };
}

const preview = async (
  service: ReservationsService,
  date: string,
  time: string,
  quantity: number,
) =>
  (await service.previewTables({
    experienceId: EXP_ID,
    date,
    startTime: time,
    quantity,
  })) as Record<string, any>;

describe('Reservas en una edición especial', () => {
  it('un día normal cobra el precio base con las promos habituales', async () => {
    const { service } = build();
    const dos = await preview(service, DIA_NORMAL, '15:00', 2);
    expect(dos.pricing).toMatchObject({ unitPrice: 42000, totalAmount: 84000 });
    expect(dos.specialName).toBeUndefined();

    const cinco = await preview(service, DIA_NORMAL, '15:00', 5);
    expect(cinco.pricing).toMatchObject({
      unitPrice: 38000,
      totalAmount: 190000,
    });
  });

  it('en sus fechas cobra el precio de la edición y lo dice', async () => {
    const { service } = build();
    const r = await preview(service, HALLOWEEN, '15:00', 2);
    expect(r.specialName).toBe('Especial Halloween');
    expect(r.pricing).toMatchObject({
      unitPrice: 60000,
      totalAmount: 120000,
      depositAmount: 60000,
      balanceDue: 60000,
    });
  });

  it('en la edición rigen sus bonos y no las promos habituales', async () => {
    const { service } = build();
    // 5 personas: NO baja a 38.000 (promo habitual); aplica el bono de la
    // edición: entran 5, se cobran 4 al precio de la edición.
    const r = await preview(service, HALLOWEEN, '15:00', 5);
    expect(r.pricing).toMatchObject({
      unitPrice: 60000,
      totalAmount: 240000,
      variantName: 'Vení de a 4',
      freeSpots: 1,
    });
  });

  it('sin precio propio, la edición usa el de la experiencia', async () => {
    const { service } = build();
    const r = await preview(service, NAVIDAD, '16:00', 2);
    expect(r.specialName).toBe('Especial Navidad');
    expect(r.pricing).toMatchObject({ unitPrice: 42000, totalAmount: 84000 });
  });

  it('con horarios especiales el lugar es el cupo, sin mesas', async () => {
    const { service, tables } = build();
    const r = await preview(service, NAVIDAD, '16:00', 3);
    expect(r.fits).toBe(true);
    expect(r.tables).toEqual([]);
    expect(tables.previewAssignment).not.toHaveBeenCalled();
    // Halloween no tiene horarios propios: usa las mesas como siempre.
    await preview(service, HALLOWEEN, '15:00', 3);
    expect(tables.previewAssignment).toHaveBeenCalledTimes(1);
  });

  it('el hold cobra lo mismo que mostró el preview', async () => {
    const { service } = build();
    const price = (date: string, qty: number) =>
      (service as any).effectivePriceFor(EXP_ID, 42000, qty, at(date, '15:00'));
    await expect(price(HALLOWEEN, 2)).resolves.toEqual({
      unitPrice: 60000,
      billableQty: 2,
    });
    await expect(price(HALLOWEEN, 5)).resolves.toEqual({
      unitPrice: 60000,
      billableQty: 4,
    });
    await expect(price(DIA_NORMAL, 5)).resolves.toEqual({
      unitPrice: 38000,
      billableQty: 5,
    });
  });

  it('la reserva queda rotulada con la edición del día', async () => {
    const { service, reservationModel } = build();
    const crear = (date: string) =>
      (service as any).createReservationWithCode({
        sessionId: 's1',
        experienceId: EXP_ID,
        experienceName: AYD.name,
        startAt: at(date, '15:00'),
        quantity: 2,
      });
    await crear(HALLOWEEN);
    expect(reservationModel.create.mock.calls[0][0]).toMatchObject({
      specialId: 'sp-halloween',
      specialName: 'Especial Halloween',
    });
    await crear(DIA_NORMAL);
    expect(
      reservationModel.create.mock.calls[1][0].specialName,
    ).toBeUndefined();
  });
});

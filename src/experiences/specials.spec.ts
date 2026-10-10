import { envConfig } from '../config/env.config';
import {
  dayPlan,
  normalizeSpecials,
  publicSpecials,
  specialDatesLabel,
  specialOn,
  specialStatus,
  specialsError,
} from './specials';

// Halloween: del 30/10 al 1/11, se ofrece desde el 1/10.
const HALLOWEEN = {
  _id: 'h1',
  name: 'Especial Halloween',
  aliases: ['halloween', 'noche de brujas'],
  dateFrom: '2026-10-30',
  dateTo: '2026-11-01',
  announceFrom: '2026-10-01',
  price: 60000,
};
const NAVIDAD = {
  _id: 'n1',
  name: 'Especial Navidad',
  aliases: ['navidad'],
  dateFrom: '2026-12-19',
  dateTo: '2026-12-23',
};

describe('ediciones especiales de una experiencia', () => {
  beforeAll(() => {
    envConfig.businessOpen = '15:00';
    envConfig.businessClose = '20:00';
  });

  it('una edición rige sólo entre su primer y su último día', () => {
    const all = [HALLOWEEN, NAVIDAD];
    expect(specialOn(all, '2026-10-29')).toBeUndefined();
    expect(specialOn(all, '2026-10-30')?.name).toBe('Especial Halloween');
    expect(specialOn(all, '2026-11-01')?.name).toBe('Especial Halloween');
    expect(specialOn(all, '2026-11-02')).toBeUndefined();
    expect(specialOn(all, '2026-12-20')?.name).toBe('Especial Navidad');
  });

  it('una edición apagada no rige', () => {
    expect(
      specialOn([{ ...HALLOWEEN, active: false }], '2026-10-31'),
    ).toBeUndefined();
  });

  it('estado: próxima hasta que abre reservas, vigente hasta su último día, después finalizada', () => {
    expect(specialStatus(HALLOWEEN, '2026-09-30')).toBe('PROXIMA');
    expect(specialStatus(HALLOWEEN, '2026-10-01')).toBe('VIGENTE');
    expect(specialStatus(HALLOWEEN, '2026-11-01')).toBe('VIGENTE');
    expect(specialStatus(HALLOWEEN, '2026-11-02')).toBe('FINALIZADA');
    // Sin fecha de anuncio se ofrece apenas se carga.
    expect(specialStatus(NAVIDAD, '2026-06-01')).toBe('VIGENTE');
  });

  it('plan del día: sin edición manda el horario de siempre', () => {
    expect(
      dayPlan({ specials: [HALLOWEEN] }, '2026-10-20', '2026-10-10'),
    ).toEqual({
      special: undefined,
      own: false,
      starts: [],
      notAnnounced: false,
    });
    // Con horario propio (Escuelita, miércoles 18:00): 2026-10-21 es miércoles.
    const escuelita = {
      ownSchedule: [{ weekday: 3, start: '18:00' }],
      specials: [],
    };
    expect(dayPlan(escuelita, '2026-10-21', '2026-10-10')).toMatchObject({
      own: true,
      starts: ['18:00'],
    });
  });

  it('plan del día: la edición sin horarios usa los turnos habituales', () => {
    const plan = dayPlan({ specials: [HALLOWEEN] }, '2026-10-31', '2026-10-10');
    expect(plan.special?.name).toBe('Especial Halloween');
    expect(plan.own).toBe(false);
    expect(plan.notAnnounced).toBe(false);
  });

  it('plan del día: con horarios especiales sólo se ofrece en esas horas', () => {
    const conHorario = {
      ...HALLOWEEN,
      schedule: [
        { start: '18:00' },
        { start: '16:00', date: '2026-10-31' },
        { start: '18:00' },
      ],
    };
    const exp = { specials: [conHorario] };
    expect(dayPlan(exp, '2026-10-30', '2026-10-10')).toMatchObject({
      own: true,
      starts: ['18:00'],
    });
    expect(dayPlan(exp, '2026-10-31', '2026-10-10')).toMatchObject({
      own: true,
      starts: ['16:00', '18:00'],
    });
    // Sólo con fechas puntuales: el día sin horario no se ofrece.
    const soloEl31 = {
      specials: [
        { ...HALLOWEEN, schedule: [{ start: '17:00', date: '2026-10-31' }] },
      ],
    };
    expect(dayPlan(soloEl31, '2026-10-30', '2026-10-10')).toMatchObject({
      own: true,
      starts: [],
    });
  });

  it('plan del día: antes de abrir reservas, la edición avisa que todavía no se ofrece', () => {
    expect(
      dayPlan({ specials: [HALLOWEEN] }, '2026-10-31', '2026-09-15')
        .notAnnounced,
    ).toBe(true);
    expect(
      dayPlan({ specials: [HALLOWEEN] }, '2026-10-31', '2026-10-01')
        .notAnnounced,
    ).toBe(false);
  });

  it('valida fechas, superposición, horarios y activadores repetidos', () => {
    expect(specialsError([HALLOWEEN, NAVIDAD], 120)).toBeNull();
    expect(specialsError([{ ...HALLOWEEN, name: ' ' }], 120)).toMatch(/nombre/);
    expect(
      specialsError([{ ...HALLOWEEN, dateFrom: '2026-11-05' }], 120),
    ).toMatch(/termina antes de empezar/);
    expect(
      specialsError([{ ...HALLOWEEN, announceFrom: '2026-11-10' }], 120),
    ).toMatch(/después de haber terminado/);
    expect(
      specialsError(
        [
          HALLOWEEN,
          { ...NAVIDAD, dateFrom: '2026-11-01', dateTo: '2026-11-03' },
        ],
        120,
      ),
    ).toMatch(/se pisan en fechas/);
    // Una apagada no cuenta para la superposición.
    expect(
      specialsError(
        [
          HALLOWEEN,
          {
            ...NAVIDAD,
            dateFrom: '2026-11-01',
            dateTo: '2026-11-03',
            active: false,
          },
        ],
        120,
      ),
    ).toBeNull();
    expect(
      specialsError([{ ...HALLOWEEN, schedule: [{ start: '19:00' }] }], 120),
    ).toMatch(/no entra en el horario del salón/);
    expect(
      specialsError(
        [{ ...HALLOWEEN, schedule: [{ start: '16:00', date: '2026-12-01' }] }],
        120,
      ),
    ).toMatch(/fuera de sus fechas/);
    expect(
      specialsError([HALLOWEEN, { ...NAVIDAD, aliases: ['Halloween'] }], 120),
    ).toMatch(/repite un nombre o activador/);
  });

  it('normaliza lo que manda el panel', () => {
    const [s] = normalizeSpecials([
      {
        ...HALLOWEEN,
        name: '  Especial Halloween ',
        aliases: ['Halloween', 'halloween', 'x', ' '],
        announceFrom: '',
        included: [' copa de bienvenida ', ''],
        extras: [
          { name: ' Pieza temática ', price: 5000 },
          { name: ' ', price: 1 },
        ],
        schedule: [{ start: '18:00', date: '' }],
      },
    ])!;
    expect(s.name).toBe('Especial Halloween');
    expect(s.aliases).toEqual(['Halloween']);
    expect(s.announceFrom).toBeUndefined();
    expect(s.included).toEqual(['copa de bienvenida']);
    expect(s.extras).toEqual([
      { name: 'Pieza temática', price: 5000, description: undefined },
    ]);
    expect(s.schedule).toEqual([{ start: '18:00' }]);
  });

  it('vista pública: con estado, sin las apagadas ni las que terminaron hace mucho', () => {
    const vieja = {
      ...NAVIDAD,
      name: 'Día del niño',
      aliases: [],
      dateFrom: '2026-08-15',
      dateTo: '2026-08-16',
    };
    const out = publicSpecials(
      [
        NAVIDAD,
        HALLOWEEN,
        vieja,
        { ...NAVIDAD, name: 'Apagada', active: false },
      ],
      '2026-11-05',
    );
    expect(out.map((s) => [s.name, s.status])).toEqual([
      ['Especial Halloween', 'FINALIZADA'],
      ['Especial Navidad', 'VIGENTE'],
    ]);
  });

  it('describe sus fechas', () => {
    expect(specialDatesLabel(HALLOWEEN)).toBe('del 30/10 al 1/11');
    expect(
      specialDatesLabel({ dateFrom: '2026-10-31', dateTo: '2026-10-31' }),
    ).toBe('el 31/10');
  });
});

import { DateTime } from 'luxon';
import {
  parseShifts,
  resolveShift,
  shiftAllowsExperience,
  shiftsFitting,
  shiftsForDate,
  startWindow,
  weekdayOf,
} from './shifts';

const TZ = 'America/Argentina/Buenos_Aires';
const DEFAULT = 'T1|Turno 1|15:00|17:30;T2|Turno 2|17:50|20:00';

/** Instante absoluto a partir de una fecha y hora locales del negocio. */
function at(dateKey: string, hhmm: string): Date {
  return DateTime.fromISO(`${dateKey}T${hhmm}`, { zone: TZ }).toJSDate();
}

describe('parseShifts', () => {
  it('parsea la definición por defecto', () => {
    expect(parseShifts(DEFAULT, 20)).toEqual([
      { key: 'T1', name: 'Turno 1', start: '15:00', end: '17:30' },
      { key: 'T2', name: 'Turno 2', start: '17:50', end: '20:00' },
    ]);
  });

  it('exige el hueco de limpieza entre turnos', () => {
    // 17:30 → 17:30 no deja tiempo para limpiar.
    expect(() =>
      parseShifts('T1|Turno 1|15:00|17:30;T2|Turno 2|17:30|20:00', 20),
    ).toThrow(/se necesitan 20/);
  });

  it('acepta el hueco justo', () => {
    expect(
      parseShifts('T1|Turno 1|15:00|17:30;T2|Turno 2|17:50|20:00', 20),
    ).toHaveLength(2);
  });

  it('rechaza turnos solapados', () => {
    expect(() =>
      parseShifts('T1|Turno 1|15:00|18:00;T2|Turno 2|17:30|20:00', 20),
    ).toThrow(/se solapan/);
  });

  it('rechaza un turno que termina antes de empezar', () => {
    expect(() => parseShifts('T1|Turno 1|18:00|15:00', 20)).toThrow(
      /termina antes/,
    );
  });

  it('rechaza claves repetidas', () => {
    expect(() =>
      parseShifts('T1|Uno|15:00|16:00;T1|Dos|17:00|18:00', 20),
    ).toThrow(/repetida/);
  });

  it('rechaza horas mal escritas', () => {
    expect(() => parseShifts('T1|Turno 1|25:00|26:00', 20)).toThrow(/inválida/);
  });

  it('rechaza una definición vacía', () => {
    expect(() => parseShifts('', 20)).toThrow(/ningún turno/);
  });
});

describe('startWindow', () => {
  const t1 = { key: 'T1', name: 'Turno 1', start: '15:00', end: '17:30' };
  const t2 = { key: 'T2', name: 'Turno 2', start: '17:50', end: '20:00' };

  it('una experiencia de 2 h arranca entre 15:00 y 15:30 en el turno 1', () => {
    expect(startWindow(t1, 120)).toEqual({
      earliest: '15:00',
      latest: '15:30',
    });
  });

  it('en el turno 2 arranca entre 17:50 y 18:00', () => {
    expect(startWindow(t2, 120)).toEqual({
      earliest: '17:50',
      latest: '18:00',
    });
  });

  it('una experiencia de 3 h no entra en ningún turno', () => {
    expect(startWindow(t1, 180)).toBeNull();
    expect(startWindow(t2, 180)).toBeNull();
  });
});

describe('resolveShift', () => {
  it('ubica una experiencia de 2 h que arranca a las 15:00 en el turno 1', () => {
    const r = resolveShift(at('2026-08-01', '15:00'), 120, TZ);
    expect(r?.shift.key).toBe('T1');
    expect(r?.dateKey).toBe('2026-08-01');
  });

  it('ubica el último inicio válido del turno 1', () => {
    expect(resolveShift(at('2026-08-01', '15:30'), 120, TZ)?.shift.key).toBe(
      'T1',
    );
  });

  it('rechaza una experiencia que cruza el borde entre turnos', () => {
    // 16:00 + 2 h = 18:00, se pasa del fin del turno 1 (17:30).
    expect(resolveShift(at('2026-08-01', '16:00'), 120, TZ)).toBeNull();
  });

  it('rechaza el hueco de limpieza como hora de inicio', () => {
    expect(resolveShift(at('2026-08-01', '17:40'), 120, TZ)).toBeNull();
  });

  it('ubica el turno 2', () => {
    expect(resolveShift(at('2026-08-01', '17:50'), 120, TZ)?.shift.key).toBe(
      'T2',
    );
    expect(resolveShift(at('2026-08-01', '18:00'), 120, TZ)?.shift.key).toBe(
      'T2',
    );
  });

  it('rechaza terminar después del cierre', () => {
    expect(resolveShift(at('2026-08-01', '18:30'), 120, TZ)).toBeNull();
  });

  it('rechaza empezar antes de la apertura', () => {
    expect(resolveShift(at('2026-08-01', '14:00'), 120, TZ)).toBeNull();
  });

  it('usa la fecha del negocio, no la UTC', () => {
    // 20:00 AR del 1/8 es 23:00 UTC del mismo día; la fecha de negocio no cambia.
    const r = resolveShift(at('2026-08-01', '18:00'), 120, TZ);
    expect(r?.dateKey).toBe('2026-08-01');
  });
});

describe('shiftsFitting', () => {
  it('una experiencia de 2 h entra en los dos turnos', () => {
    expect(shiftsFitting(120).map((s) => s.key)).toEqual(['T1', 'T2']);
  });

  it('una de 3 h no entra en ninguno', () => {
    expect(shiftsFitting(180)).toEqual([]);
  });

  it('una de 150 min sólo entra en el turno 1', () => {
    expect(shiftsFitting(150).map((s) => s.key)).toEqual(['T1']);
  });
});

describe('shiftsForDate · turnos por día de la semana', () => {
  const generico = (key: string, start: string, end: string) => ({
    key,
    name: key,
    start,
    end,
  });
  const delDia = (
    key: string,
    start: string,
    end: string,
    weekday: number,
  ) => ({
    key,
    name: key,
    start,
    end,
    weekday,
  });

  const base = [
    generico('T1', '15:00', '17:30'),
    generico('T2', '17:50', '20:00'),
  ];

  it('sin plantillas por día, todos los días usan las genéricas', () => {
    // 2026-08-01 es sábado.
    expect(shiftsForDate(base, '2026-08-01').map((s) => s.key)).toEqual([
      'T1',
      'T2',
    ]);
  });

  it('las plantillas de un día puntual reemplazan a las genéricas', () => {
    // Viernes (weekday 5) con un solo turno más largo.
    const all = [...base, delDia('TV', '16:00', '20:00', 5)];
    expect(shiftsForDate(all, '2026-07-31').map((s) => s.key)).toEqual(['TV']);
    // El sábado sigue con las genéricas.
    expect(shiftsForDate(all, '2026-08-01').map((s) => s.key)).toEqual([
      'T1',
      'T2',
    ]);
  });

  it('sin fecha devuelve sólo las genéricas', () => {
    const all = [...base, delDia('TV', '16:00', '20:00', 5)];
    expect(shiftsForDate(all, '').map((s) => s.key)).toEqual(['T1', 'T2']);
  });

  it('weekdayOf usa el estándar ISO (1=lunes … 7=domingo)', () => {
    expect(weekdayOf('2026-07-27')).toBe(1); // lunes
    expect(weekdayOf('2026-08-01')).toBe(6); // sábado
    expect(weekdayOf('2026-08-02')).toBe(7); // domingo
  });
});

describe('shiftAllowsExperience', () => {
  const t1 = { key: 'T1', name: 'Turno 1', start: '15:00', end: '17:30' };

  it('sin lista, el turno acepta cualquier experiencia', () => {
    expect(shiftAllowsExperience(t1, 'exp1')).toBe(true);
    expect(shiftAllowsExperience({ ...t1, experienceIds: [] }, 'exp1')).toBe(
      true,
    );
  });

  it('con lista, sólo las que figuran', () => {
    const acotado = { ...t1, experienceIds: ['expA', 'expB'] };
    expect(shiftAllowsExperience(acotado, 'expA')).toBe(true);
    expect(shiftAllowsExperience(acotado, 'expC')).toBe(false);
  });
});

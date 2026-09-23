import { DateTime } from 'luxon';
import {
  bookingStartWindow,
  checkBookingWindow,
  earlyStartOf,
  parseShifts,
  shiftAllowsExperience,
  shiftsFitting,
  shiftsForDate,
  startWindow,
  suggestedShiftFor,
  weekdayOf,
} from './shifts';

const TZ = 'America/Argentina/Buenos_Aires';
const DEFAULT = 'T1|Turno 1|15:00|17:30;T2|Turno 2|17:40|20:00';

/** Instante absoluto a partir de una fecha y hora locales del negocio. */
function at(dateKey: string, hhmm: string): Date {
  return DateTime.fromISO(`${dateKey}T${hhmm}`, { zone: TZ }).toJSDate();
}

describe('parseShifts', () => {
  it('parsea la definición por defecto', () => {
    expect(parseShifts(DEFAULT)).toEqual([
      { key: 'T1', name: 'Turno 1', start: '15:00', end: '17:30' },
      { key: 'T2', name: 'Turno 2', start: '17:40', end: '20:00' },
    ]);
  });

  it('acepta turnos pegados (la limpieza ya no vive entre turnos)', () => {
    expect(
      parseShifts('T1|Turno 1|15:00|17:30;T2|Turno 2|17:30|20:00'),
    ).toHaveLength(2);
  });

  it('rechaza turnos solapados', () => {
    expect(() =>
      parseShifts('T1|Turno 1|15:00|18:00;T2|Turno 2|17:30|20:00'),
    ).toThrow(/se solapan/);
  });

  it('rechaza un turno que termina antes de empezar', () => {
    expect(() => parseShifts('T1|Turno 1|18:00|15:00')).toThrow(
      /termina antes/,
    );
  });

  it('rechaza claves repetidas', () => {
    expect(() => parseShifts('T1|Uno|15:00|16:00;T1|Dos|17:00|18:00')).toThrow(
      /repetida/,
    );
  });

  it('rechaza horas mal escritas', () => {
    expect(() => parseShifts('T1|Turno 1|25:00|26:00')).toThrow(/inválida/);
  });

  it('rechaza una definición vacía', () => {
    expect(() => parseShifts('')).toThrow(/ningún turno/);
  });
});

describe('checkBookingWindow · horario libre con ventana 15:00–20:00', () => {
  it('acepta el inicio de la ventana', () => {
    const r = checkBookingWindow(at('2026-08-01', '15:00'), 120, TZ);
    expect(r).toEqual({ ok: true, dateKey: '2026-08-01' });
  });

  it('acepta un horario que rompe los turnos (16:30 + 2 h = 18:30)', () => {
    expect(checkBookingWindow(at('2026-08-01', '16:30'), 120, TZ).ok).toBe(
      true,
    );
  });

  it('acepta terminar justo al cierre (18:00 + 2 h = 20:00)', () => {
    expect(checkBookingWindow(at('2026-08-01', '18:00'), 120, TZ).ok).toBe(
      true,
    );
  });

  it('rechaza terminar después del cierre', () => {
    const r = checkBookingWindow(at('2026-08-01', '18:30'), 120, TZ);
    expect(r).toEqual({ ok: false, reason: 'AFTER_CLOSE' });
  });

  it('rechaza empezar antes de la apertura', () => {
    const r = checkBookingWindow(at('2026-08-01', '14:00'), 120, TZ);
    expect(r).toEqual({ ok: false, reason: 'BEFORE_OPEN' });
  });

  it('rechaza una actividad más larga que la ventana', () => {
    const r = checkBookingWindow(at('2026-08-01', '15:00'), 360, TZ);
    expect(r).toEqual({ ok: false, reason: 'TOO_LONG' });
  });

  it('usa la fecha del negocio, no la UTC', () => {
    // 18:00 AR es 21:00 UTC del mismo día; la fecha de negocio no cambia.
    const r = checkBookingWindow(at('2026-08-01', '18:00'), 120, TZ);
    expect(r).toEqual({ ok: true, dateKey: '2026-08-01' });
  });
});

describe('bookingStartWindow', () => {
  it('una experiencia de 2 h arranca entre 15:00 y 18:00', () => {
    expect(bookingStartWindow(120)).toEqual({
      earliest: '15:00',
      latest: '18:00',
    });
  });

  it('una de 5 h entra justo (ventana completa)', () => {
    expect(bookingStartWindow(300)).toEqual({
      earliest: '15:00',
      latest: '15:00',
    });
  });

  it('una de 6 h no entra', () => {
    expect(bookingStartWindow(360)).toBeNull();
  });
});

describe('suggestedShiftFor · etiqueta de turno sugerido', () => {
  it('etiqueta una experiencia de 2 h que arranca a las 15:00 como T1', () => {
    const r = suggestedShiftFor(at('2026-08-01', '15:00'), 120, TZ);
    expect(r?.shift.key).toBe('T1');
    expect(r?.dateKey).toBe('2026-08-01');
  });

  it('etiqueta el turno 2', () => {
    expect(
      suggestedShiftFor(at('2026-08-01', '17:50'), 120, TZ)?.shift.key,
    ).toBe('T2');
  });

  it('el inicio anticipado del turno 2 (17:30) cuenta como turno 2', () => {
    expect(
      suggestedShiftFor(at('2026-08-01', '17:30'), 120, TZ)?.shift.key,
    ).toBe('T2');
    expect(
      suggestedShiftFor(at('2026-08-01', '17:40'), 120, TZ)?.shift.key,
    ).toBe('T2');
  });

  it('un horario que cruza turnos no tiene etiqueta (pero es válido)', () => {
    expect(suggestedShiftFor(at('2026-08-01', '16:30'), 120, TZ)).toBeNull();
    expect(checkBookingWindow(at('2026-08-01', '16:30'), 120, TZ).ok).toBe(
      true,
    );
  });
});

describe('startWindow (sugerencias)', () => {
  const t1 = { key: 'T1', name: 'Turno 1', start: '15:00', end: '17:30' };
  const t2 = { key: 'T2', name: 'Turno 2', start: '17:40', end: '20:00' };

  it('una experiencia de 2 h arranca entre 15:00 y 15:30 en el turno 1', () => {
    expect(startWindow(t1, 120)).toEqual({
      earliest: '15:00',
      latest: '15:30',
    });
  });

  it('en el turno 2 arranca entre 17:40 y 18:00', () => {
    expect(startWindow(t2, 120)).toEqual({
      earliest: '17:40',
      latest: '18:00',
    });
  });

  it('una experiencia de 3 h no entra en ningún turno sugerido', () => {
    expect(startWindow(t1, 180)).toBeNull();
    expect(startWindow(t2, 180)).toBeNull();
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
    generico('T2', '17:40', '20:00'),
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

describe('earlyStartOf · inicio anticipado', () => {
  const t1 = { key: 'T1', name: 'Turno 1', start: '15:00', end: '17:30' };
  const t2 = { key: 'T2', name: 'Turno 2', start: '17:40', end: '20:00' };

  it('el turno 2 puede arrancar cuando termina el turno 1 (se saltea la limpieza)', () => {
    expect(earlyStartOf(t2, [t1, t2])).toBe('17:30');
  });

  it('el primer turno del día no tiene inicio anticipado', () => {
    expect(earlyStartOf(t1, [t1, t2])).toBeNull();
  });

  it('no depende del orden en que vengan las plantillas', () => {
    expect(earlyStartOf(t2, [t2, t1])).toBe('17:30');
  });

  it('sin hueco entre turnos no hay inicio anticipado', () => {
    const pegado = { ...t2, start: '17:30' };
    expect(earlyStartOf(pegado, [t1, pegado])).toBeNull();
  });
});

import { DateTime } from 'luxon';
import {
  hasOwnSchedule,
  isOwnSlot,
  ownScheduleError,
  ownStartsFor,
} from './own-schedule';

const TZ = 'America/Argentina/Buenos_Aires';
// Escuelita: miércoles de 18:00 a 19:45.
const ESCUELITA = [{ weekday: 3, start: '18:00' }];

function at(dateKey: string, hhmm: string): Date {
  return DateTime.fromISO(`${dateKey}T${hhmm}`, { zone: TZ }).toJSDate();
}

describe('horario propio de una experiencia', () => {
  it('sin horario propio usa los turnos generales', () => {
    expect(hasOwnSchedule([])).toBe(false);
    expect(hasOwnSchedule(undefined)).toBe(false);
    expect(hasOwnSchedule(ESCUELITA)).toBe(true);
  });

  it('ofrece sus horas sólo el día que corresponde', () => {
    // 2026-09-30 es miércoles; 2026-10-01, jueves.
    expect(ownStartsFor(ESCUELITA, '2026-09-30')).toEqual(['18:00']);
    expect(ownStartsFor(ESCUELITA, '2026-10-01')).toEqual([]);
  });

  it('varias horas el mismo día salen ordenadas y sin repetir', () => {
    const s = [
      { weekday: 3, start: '18:00' },
      { weekday: 3, start: '15:30' },
      { weekday: 3, start: '18:00' },
    ];
    expect(ownStartsFor(s, '2026-09-30')).toEqual(['15:30', '18:00']);
  });

  it('reconoce un turno que arranca justo en su horario propio', () => {
    expect(isOwnSlot(ESCUELITA, at('2026-09-30', '18:00'), TZ)).toBe(true);
    expect(isOwnSlot(ESCUELITA, at('2026-09-30', '17:40'), TZ)).toBe(false);
    expect(isOwnSlot(ESCUELITA, at('2026-10-01', '18:00'), TZ)).toBe(false);
    expect(isOwnSlot([], at('2026-09-30', '18:00'), TZ)).toBe(false);
  });

  it('un horario que no entra en la franja del salón no se acepta', () => {
    expect(ownScheduleError(ESCUELITA, 105)).toBeNull(); // 18:00 + 1:45 = 19:45
    expect(ownScheduleError([{ weekday: 3, start: '19:00' }], 105)).toMatch(
      /miércoles a las 19:00 no entra/,
    );
    expect(ownScheduleError([{ weekday: 2, start: '10:00' }], 120)).toMatch(
      /martes a las 10:00 no entra/,
    );
  });
});

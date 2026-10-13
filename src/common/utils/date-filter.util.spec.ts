import { buildDateFilter, businessDayBound } from './date-filter.util';

// El negocio está en Argentina (UTC-3) y el servidor en UTC.
describe('cortes de día en la zona del negocio', () => {
  it('el día empieza y termina a la medianoche de Argentina', () => {
    expect(businessDayBound('2026-10-10', 'start').toISOString()).toBe('2026-10-10T03:00:00.000Z');
    expect(businessDayBound('2026-10-10', 'end').toISOString()).toBe('2026-10-11T02:59:59.999Z');
  });

  it('una caja reabierta el 10 a las 21:29 entra en el cierre que termina el 10', () => {
    const { createdAt } = buildDateFilter('2026-09-11', '2026-10-10');
    const egreso = new Date('2026-10-10T21:29:00-03:00');
    expect(egreso >= createdAt.$gte && egreso <= createdAt.$lte).toBe(true);
  });

  it('el 10 a la noche no se cuenta también en el cierre siguiente', () => {
    const { createdAt } = buildDateFilter('2026-10-11', '2026-11-10');
    expect(new Date('2026-10-10T21:29:00-03:00') >= createdAt.$gte).toBe(false);
  });

  it('respeta una fecha con hora explícita', () => {
    const { createdAt } = buildDateFilter('2026-10-10T12:00:00.000Z');
    expect(createdAt.$gte.toISOString()).toBe('2026-10-10T12:00:00.000Z');
  });
});

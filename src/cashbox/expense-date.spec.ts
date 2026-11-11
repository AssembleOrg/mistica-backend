import { BadRequestException } from '@nestjs/common';
import { planExpenseDate } from './expense-date';

const TZ = 'America/Argentina/Buenos_Aires';
// 11/11/2026 15:00 en Argentina (18:00 UTC).
const NOW = new Date('2026-11-11T18:00:00.000Z');

describe('planExpenseDate', () => {
  it('sin fecha va a la caja, como siempre', () => {
    expect(planExpenseDate(undefined, NOW, true, TZ)).toEqual({ kind: 'cashbox' });
    expect(planExpenseDate(undefined, NOW, false, TZ)).toEqual({ kind: 'cashbox' });
  });

  it('hoy con caja abierta va a la caja', () => {
    expect(planExpenseDate('2026-11-11', NOW, true, TZ)).toEqual({ kind: 'cashbox' });
  });

  it('hoy sin caja abierta se registra ahora, fuera de caja', () => {
    expect(planExpenseDate('2026-11-11', NOW, false, TZ)).toEqual({
      kind: 'dated',
      occurredAt: NOW,
    });
  });

  it('hoy según Argentina aunque en UTC ya sea mañana', () => {
    // 22:30 del 11/11 en Argentina = 01:30 del 12/11 UTC.
    const night = new Date('2026-11-12T01:30:00.000Z');
    expect(planExpenseDate('2026-11-11', night, true, TZ)).toEqual({ kind: 'cashbox' });
  });

  it('un día del mes pasado queda al mediodía de ese día (hora Argentina)', () => {
    const plan = planExpenseDate('2026-10-28', NOW, true, TZ);
    expect(plan).toEqual({
      kind: 'dated',
      occurredAt: new Date('2026-10-28T15:00:00.000Z'),
    });
  });

  it('un día del mes que viene también se fecha, aunque haya caja abierta', () => {
    const plan = planExpenseDate('2026-12-05', NOW, true, TZ);
    expect(plan).toEqual({
      kind: 'dated',
      occurredAt: new Date('2026-12-05T15:00:00.000Z'),
    });
  });

  it('rechaza fechas inválidas o muy lejanas', () => {
    expect(() => planExpenseDate('2026-13-01', NOW, true, TZ)).toThrow(BadRequestException);
    expect(() => planExpenseDate('11/11/2026', NOW, true, TZ)).toThrow(BadRequestException);
    expect(() => planExpenseDate('2028-01-01', NOW, true, TZ)).toThrow(BadRequestException);
    expect(() => planExpenseDate('2025-10-01', NOW, true, TZ)).toThrow(BadRequestException);
  });
});

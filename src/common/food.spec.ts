import { experienceFood, reservationFood } from './food';

describe('comida de experiencias y reservas', () => {
  it('manda lo cargado en la experiencia', () => {
    expect(experienceFood({ name: 'Arte & Degustación', food: 'MERIENDA' })).toBe('MERIENDA');
  });

  it('sin cargar: deduce del nombre', () => {
    expect(experienceFood({ name: 'Arte & Degustación' })).toBe('BUFFET');
    expect(experienceFood({ name: 'Promo merienda' })).toBe('MERIENDA');
    expect(experienceFood({ name: 'Taller de torno' })).toBe('NONE');
  });

  it('respeta el tilde viejo', () => {
    expect(experienceFood({ name: 'Arte & Degustación', hasBuffet: false })).toBe('NONE');
    expect(experienceFood({ name: 'Taller', hasBuffet: true })).toBe('BUFFET');
    expect(experienceFood({ name: 'Merienda de taller', hasBuffet: true })).toBe('MERIENDA');
  });

  it('la reserva puede cambiarla (promo con merienda que paga buffet)', () => {
    const exp = { name: 'Promo noviembre', food: 'MERIENDA' as const };
    expect(reservationFood({}, exp)).toBe('MERIENDA');
    expect(reservationFood({ food: 'BUFFET' }, exp)).toBe('BUFFET');
    expect(reservationFood({ food: null }, exp)).toBe('MERIENDA');
  });
});

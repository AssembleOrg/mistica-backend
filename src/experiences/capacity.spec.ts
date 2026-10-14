import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { CreateExperienceDto } from '../common/dto/experience.dto';
import { DEFAULT_EXPERIENCE_CAPACITY, capacityFor } from './capacity';

// Mismas opciones que el pipe global de main.ts.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});
const meta: ArgumentMetadata = { type: 'body', metatype: CreateExperienceDto };
const base = {
  name: 'Prueba',
  durationMinutes: 120,
  basePrice: 30000,
  color: '#9d684e',
};

describe('cupo de una experiencia', () => {
  const MESAS = [
    { code: 'M1', seats: 2, kind: 'SMALL' as const },
    { code: 'M2', seats: 2, kind: 'SMALL' as const },
    { code: 'G1', seats: 10, kind: 'LARGE' as const },
    { code: 'G2', seats: 10, kind: 'LARGE' as const },
  ];

  it('sin mesa asignada rige el límite del local: 40', () => {
    expect(DEFAULT_EXPERIENCE_CAPACITY).toBe(40);
    expect(capacityFor(undefined, MESAS)).toBe(40);
    expect(capacityFor([], MESAS)).toBe(40);
  });

  it('con mesa asignada el límite son los lugares de esa mesa', () => {
    expect(capacityFor(['G2'], MESAS)).toBe(10);
    expect(capacityFor(['M1', 'M2'], MESAS)).toBe(4);
  });

  it('una mesa grande con otra unida pierde la punta', () => {
    expect(capacityFor(['G2', 'M1'], MESAS)).toBe(11);
    expect(capacityFor(['G2', 'M1', 'M2'], MESAS)).toBe(13);
    expect(capacityFor(['g1', 'G2'], MESAS)).toBe(18);
  });

  it('una mesa que ya no existe no deja la experiencia sin lugar', () => {
    expect(capacityFor(['G9'], MESAS)).toBe(40);
  });

  it.each([
    ['sin el campo', {}],
    ['con null', { defaultCapacity: null }],
    ['con 0 (campo vaciado en el panel)', { defaultCapacity: 0 }],
    ['con un cupo', { defaultCapacity: 12 }],
  ])('se puede crear %s', async (_nombre, extra) => {
    await expect(pipe.transform({ ...base, ...extra }, meta)).resolves.toBeDefined();
  });

  it('rechaza un cupo negativo o con decimales', async () => {
    await expect(
      pipe.transform({ ...base, defaultCapacity: -3 }, meta),
    ).rejects.toBeDefined();
    await expect(
      pipe.transform({ ...base, defaultCapacity: 7.5 }, meta),
    ).rejects.toBeDefined();
  });
});

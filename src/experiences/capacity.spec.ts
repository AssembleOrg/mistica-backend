import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { CreateExperienceDto } from '../common/dto/experience.dto';
import { DEFAULT_EXPERIENCE_CAPACITY, capacityOrDefault } from './capacity';

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
  it('vacío es el cupo por defecto: 40', () => {
    expect(DEFAULT_EXPERIENCE_CAPACITY).toBe(40);
    expect(capacityOrDefault(undefined)).toBe(40);
    expect(capacityOrDefault(null)).toBe(40);
    expect(capacityOrDefault(0)).toBe(40);
  });

  it('respeta el cupo cargado', () => {
    expect(capacityOrDefault(8)).toBe(8);
    expect(capacityOrDefault(60)).toBe(60);
  });

  it.each([
    ['sin el campo', {}],
    ['con null', { defaultCapacity: null }],
    ['con 0 (campo vaciado en el panel)', { defaultCapacity: 0 }],
    ['con un cupo', { defaultCapacity: 12 }],
  ])('se puede crear %s', async (_nombre, extra) => {
    const dto = (await pipe.transform(
      { ...base, ...extra },
      meta,
    )) as CreateExperienceDto;
    expect(capacityOrDefault(dto.defaultCapacity)).toBe(
      (extra as { defaultCapacity?: number | null }).defaultCapacity || 40,
    );
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

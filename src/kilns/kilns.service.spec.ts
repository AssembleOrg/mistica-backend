import { KilnsService } from './kilns.service';

describe('Hornos · cargar uno de otro día', () => {
  const build = () => {
    const model = {
      create: jest.fn(async (doc: Record<string, unknown>) => ({
        toObject: () => ({ _id: 'k1', ...doc }),
      })),
    };
    return { service: new KilnsService(model as never, {} as never), model };
  };

  it('admin o encargado lo cargan con la fecha que pasó', async () => {
    const { service, model } = build();
    const at = '2026-10-15T12:00:00.000Z';
    await service.create({ kiln: 'SUPERIOR', action: 'ON', at }, { role: 'manager' });
    expect(model.create.mock.calls[0][0].at).toEqual(new Date(at));
  });

  it('otra cuenta no puede cargar con fecha', async () => {
    const { service } = build();
    await expect(
      service.create(
        { kiln: 'SUPERIOR', action: 'ON', at: '2026-10-15T12:00:00.000Z' },
        { role: 'user' },
      ),
    ).rejects.toThrow(/admin o encargado/);
  });

  it('no se carga un horno en el futuro', async () => {
    const { service } = build();
    const future = new Date(Date.now() + 3_600_000).toISOString();
    await expect(
      service.create({ kiln: 'FRONTAL', action: 'OFF', at: future }, { role: 'admin' }),
    ).rejects.toThrow(/futura/);
  });

  it('sin fecha es ahora (como siempre)', async () => {
    const { service, model } = build();
    await service.create({ kiln: 'FRONTAL', action: 'ON' }, { role: 'user' });
    const at = model.create.mock.calls[0][0].at as Date;
    expect(Math.abs(at.getTime() - Date.now())).toBeLessThan(5000);
  });
});

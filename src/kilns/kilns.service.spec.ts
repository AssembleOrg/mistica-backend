import { KilnsService } from './kilns.service';

describe('Hornos · cargar uno de otro día', () => {
  const build = () => {
    const model = {
      findOne: jest.fn(() => ({ sort: () => ({ lean: async () => null }) })),
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

describe('Hornos · timer', () => {
  const build = (last: Record<string, unknown> | null) => {
    const model = {
      findOne: jest.fn(() => ({ sort: () => ({ lean: async () => last }) })),
      create: jest.fn(async (doc: Record<string, unknown>) => ({
        toObject: () => ({ _id: 'k2', ...doc }),
      })),
    };
    return { service: new KilnsService(model as never, {} as never), model };
  };
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

  it('frontal prendido hace 12 h sigue corriendo y no se vuelve a prender', async () => {
    const { service, model } = build({ _id: 'a', kiln: 'FRONTAL', action: 'ON', at: hoursAgo(12) });
    const [, frontal] = await service.status();
    expect(frontal.running).toBe(true);
    await expect(service.create({ kiln: 'FRONTAL', action: 'ON' }, { role: 'user' })).rejects.toThrow(
      /sigue prendido/,
    );
    expect(model.create).not.toHaveBeenCalled();
  });

  it('superior se libera a las 13 h', async () => {
    const { service, model } = build({ _id: 'a', kiln: 'SUPERIOR', action: 'ON', at: hoursAgo(13.1) });
    await service.create({ kiln: 'SUPERIOR', action: 'ON' }, { role: 'user' });
    expect(model.create).toHaveBeenCalled();
  });

  it('frontal corre 26 h', async () => {
    const { service } = build({ _id: 'a', kiln: 'FRONTAL', action: 'ON', at: hoursAgo(25) });
    const [, frontal] = await service.status();
    expect(frontal.running).toBe(true);
    expect(frontal.durationMs).toBe(26 * 3_600_000);
  });

  it('un prendido reiniciado no corre', async () => {
    const { service } = build({
      _id: 'a', kiln: 'FRONTAL', action: 'ON', at: hoursAgo(1), resetAt: new Date(),
    });
    const [, frontal] = await service.status();
    expect(frontal.running).toBe(false);
  });

  it('reiniciar marca el prendido y libera el horno', async () => {
    const last = { _id: 'a', kiln: 'SUPERIOR', action: 'ON', at: hoursAgo(2) } as Record<string, unknown>;
    const { service, model } = build(last);
    (model as unknown as { updateOne: jest.Mock }).updateOne = jest.fn(async (_q, u) => {
      Object.assign(last, u.$set);
      return { matchedCount: 1 };
    });
    const st = await service.reset('SUPERIOR', { registeredBy: 'Sofi' });
    expect(last.resetBy).toBe('Sofi');
    expect(last.resetAt).toBeInstanceOf(Date);
    expect(st.running).toBe(false);
  });

  it('no se reinicia un horno libre', async () => {
    const { service } = build(null);
    await expect(service.reset('FRONTAL', {})).rejects.toThrow(/no tiene el timer/);
  });

  it('un apagado viejo corta el timer', async () => {
    const { service } = build({ _id: 'a', kiln: 'SUPERIOR', action: 'OFF', at: hoursAgo(1) });
    const [superior] = await service.status();
    expect(superior.running).toBe(false);
  });
});

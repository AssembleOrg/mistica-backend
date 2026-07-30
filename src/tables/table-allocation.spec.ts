import {
  FreeTables,
  maxPartySize,
  planTables,
  smallTablesNeeded,
} from './table-allocation';

const ALL_SMALL = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10'];
const ALL_LARGE = ['G1', 'G2'];

function free(over: Partial<FreeTables> = {}): FreeTables {
  return {
    small: ALL_SMALL,
    large: ALL_LARGE,
    shareableLarge: [],
    ...over,
  };
}

/** Códigos del plan, para comparar cómodo. */
function codes(qty: number, f: FreeTables, opts = {}): string[] {
  const r = planTables(qty, f, opts);
  if (!r.ok) throw new Error(`esperaba plan, vino ${r.reason}`);
  return r.tables.map((t) => t.code);
}

describe('smallTablesNeeded', () => {
  it('es ceil(qty / 2)', () => {
    expect(smallTablesNeeded(1)).toBe(1);
    expect(smallTablesNeeded(2)).toBe(1);
    expect(smallTablesNeeded(3)).toBe(2);
    expect(smallTablesNeeded(4)).toBe(2);
    expect(smallTablesNeeded(5)).toBe(3);
    expect(smallTablesNeeded(6)).toBe(3);
  });
});

describe('planTables · grupos de hasta 6', () => {
  it('1 o 2 personas → una mesa de 2', () => {
    expect(codes(1, free())).toEqual(['M1']);
    expect(codes(2, free())).toEqual(['M1']);
  });

  it('3 o 4 personas → dos mesas de 2', () => {
    expect(codes(3, free())).toEqual(['M1', 'M2']);
    expect(codes(4, free())).toEqual(['M1', 'M2']);
  });

  it('5 o 6 personas → tres mesas de 2', () => {
    expect(codes(5, free())).toEqual(['M1', 'M2', 'M3']);
    expect(codes(6, free())).toEqual(['M1', 'M2', 'M3']);
  });

  it('nunca toma una mesa grande aunque haya, si alcanzan las de 2', () => {
    expect(codes(6, free())).not.toContain('G1');
  });

  it('respeta el orden en que vienen las mesas libres', () => {
    expect(codes(4, free({ small: ['M5', 'M7', 'M9'] }))).toEqual(['M5', 'M7']);
  });

  it('rechaza al grupo chico si no quedan mesas de 2 ni compartida', () => {
    const r = planTables(4, free({ small: ['M1'] }));
    expect(r).toEqual({ ok: false, reason: 'NO_TABLES' });
  });

  it('no le da una mesa grande entera a un grupo chico por defecto', () => {
    const r = planTables(6, free({ small: [] }));
    expect(r.ok).toBe(false);
  });

  it('le da una mesa grande al grupo chico si se habilita el flag', () => {
    const r = planTables(6, free({ small: [] }), {
      smallGroupCanTakeLarge: true,
    });
    expect(r.ok && r.tables.map((t) => t.code)).toEqual(['G1']);
  });
});

describe('planTables · grupos de 7 a 10', () => {
  it('prioriza la mesa grande', () => {
    for (const qty of [7, 8, 9, 10]) {
      expect(codes(qty, free())).toEqual(['G1']);
    }
  });

  it('sin mesa grande, arma con mesas de 2', () => {
    const f = free({ large: [] });
    expect(codes(7, f)).toEqual(['M1', 'M2', 'M3', 'M4']);
    expect(codes(8, f)).toEqual(['M1', 'M2', 'M3', 'M4']);
    expect(codes(9, f)).toEqual(['M1', 'M2', 'M3', 'M4', 'M5']);
    expect(codes(10, f)).toEqual(['M1', 'M2', 'M3', 'M4', 'M5']);
  });

  it('no rechaza al grupo grande sólo porque no hay mesa grande', () => {
    const r = planTables(8, free({ large: [], small: ALL_SMALL.slice(0, 4) }));
    expect(r.ok).toBe(true);
  });

  it('rechaza si tampoco alcanzan las mesas de 2', () => {
    const r = planTables(8, free({ large: [], small: ['M1', 'M2', 'M3'] }));
    expect(r).toEqual({ ok: false, reason: 'NO_TABLES' });
  });
});

describe('planTables · más de 10 personas', () => {
  it('11 personas → una grande (9 útiles al unir) + una mesa de 2', () => {
    expect(codes(11, free())).toEqual(['G1', 'M1']);
  });

  it('12 personas → una grande + dos mesas de 2', () => {
    expect(codes(12, free())).toEqual(['G1', 'M1', 'M2']);
  });

  it('sigue sumando mesas de 2 a medida que crece el grupo', () => {
    expect(codes(13, free())).toEqual(['G1', 'M1', 'M2']);
    expect(codes(14, free())).toEqual(['G1', 'M1', 'M2', 'M3']);
    expect(codes(15, free())).toEqual(['G1', 'M1', 'M2', 'M3']);
  });

  it('usa las dos grandes cuando es la combinación que menos desperdicia', () => {
    // 18 = 9 + 9 exacto, contra 1 grande + 5 mesas de 2 (19 lugares, 6 mesas).
    expect(codes(18, free())).toEqual(['G1', 'G2']);
  });

  it('no acapara la segunda grande para un grupo que entra con una', () => {
    expect(codes(11, free())).not.toContain('G2');
    expect(codes(12, free())).not.toContain('G2');
  });

  it('combina las dos grandes con mesas de 2 para grupos muy numerosos', () => {
    expect(codes(20, free())).toEqual(['G1', 'G2', 'M1']);
    expect(codes(24, free())).toEqual(['G1', 'G2', 'M1', 'M2', 'M3']);
  });

  it('sin mesas grandes, arma todo con mesas de 2', () => {
    expect(codes(12, free({ large: [] }))).toEqual([
      'M1',
      'M2',
      'M3',
      'M4',
      'M5',
      'M6',
    ]);
  });

  it('rechaza si no entra ni usando todo lo libre', () => {
    const r = planTables(40, free());
    expect(r).toEqual({ ok: false, reason: 'NO_TABLES' });
  });
});

describe('planTables · mesa grande compartida', () => {
  const shareable = (holderQty: number) =>
    free({
      small: [],
      large: [],
      shareableLarge: [{ code: 'G1', holderQty, holderReservationId: 'r1' }],
    });

  it('sólo se ofrece cuando no quedan mesas de 2', () => {
    const conMesas = free({
      shareableLarge: [{ code: 'G1', holderQty: 4, holderReservationId: 'r1' }],
    });
    expect(codes(4, conMesas)).toEqual(['M1', 'M2']);
  });

  it('pide el consentimiento del cliente antes de asignar', () => {
    const r = planTables(4, shareable(4));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('NEEDS_SHARED_CONSENT');
    expect(r.offer).toEqual({
      tables: [{ code: 'G1', kind: 'LARGE' }],
      sharedWithReservationId: 'r1',
    });
  });

  it('asigna la compartida una vez aceptada', () => {
    const r = planTables(4, shareable(4), { sharedAccepted: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.shared).toBe(true);
    expect(r.sharedWithReservationId).toBe('r1');
    expect(r.tables.map((t) => t.code)).toEqual(['G1']);
  });

  it('permite 4+4, 3+4 y 2+4', () => {
    for (const [nuevo, holder] of [
      [4, 4],
      [3, 4],
      [2, 4],
    ]) {
      const r = planTables(nuevo, shareable(holder), { sharedAccepted: true });
      expect(r.ok).toBe(true);
    }
  });

  it('no comparte con un grupo de más de 4', () => {
    const r = planTables(5, shareable(3), { sharedAccepted: true });
    expect(r).toEqual({ ok: false, reason: 'NO_TABLES' });
  });

  it('no comparte si el que ya está es de más de 4', () => {
    const r = planTables(3, shareable(5), { sharedAccepted: true });
    expect(r).toEqual({ ok: false, reason: 'NO_TABLES' });
  });

  it('no deja pasar de 8 personas entre las dos reservas', () => {
    // 4 + 4 = 8 entra; con un holder de 4 un grupo de 4 es el tope.
    expect(planTables(4, shareable(4), { sharedAccepted: true }).ok).toBe(true);
    // 5 + 4 = 9 no entra, y además el grupo de 5 excede el máximo por reserva.
    expect(planTables(5, shareable(4), { sharedAccepted: true }).ok).toBe(
      false,
    );
  });
});

describe('planTables · entradas inválidas', () => {
  it('rechaza cantidades no positivas o no enteras', () => {
    expect(planTables(0, free()).ok).toBe(false);
    expect(planTables(-3, free()).ok).toBe(false);
    expect(planTables(2.5, free()).ok).toBe(false);
  });
});

describe('maxPartySize', () => {
  it('con el salón vacío son 38 (9 + 9 + 10 mesas de 2)', () => {
    expect(maxPartySize(free())).toBe(38);
  });

  it('una sola mesa grande libre y nada más rinde 10', () => {
    expect(maxPartySize(free({ small: [], large: ['G1'] }))).toBe(10);
  });

  it('sin mesas no entra nadie', () => {
    expect(maxPartySize(free({ small: [], large: [] }))).toBe(0);
  });
});

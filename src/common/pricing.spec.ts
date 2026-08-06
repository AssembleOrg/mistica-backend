import { effectiveUnitPrice, PriceVariantLike } from './pricing';

// El caso real del cliente: cumpleaños a $10 por persona; desde 5 personas
// $8 c/u (incluye velas); desde 10, $8 c/u con torta y pieza de regalo.
const CUMPLE: PriceVariantLike[] = [
  {
    name: 'Grupo de 5 o más',
    price: 8,
    unit: 'PER_PERSON',
    minQty: 5,
    maxQty: 9,
    description: 'Incluye velas de cumpleaños',
    active: true,
  },
  {
    name: 'Grupo de 10 o más',
    price: 8,
    unit: 'PER_PERSON',
    minQty: 10,
    description: 'Incluye torta y una pieza de cerámica de regalo',
    active: true,
  },
];

// Modalidades tipo escuelita: informativas, nunca se auto-aplican.
const ESCUELITA: PriceVariantLike[] = [
  { name: 'Por clase', price: 10, unit: 'PER_PERSON', active: true },
  { name: 'Mensual', price: 80, unit: 'FLAT', active: true },
];

describe('effectiveUnitPrice', () => {
  it('sin variantes usa el precio base y cobra todas las personas', () => {
    expect(effectiveUnitPrice([], 10, 4)).toEqual({
      unitPrice: 10,
      billableQty: 4,
    });
    expect(effectiveUnitPrice(undefined, 10, 4).unitPrice).toBe(10);
  });

  it('grupo chico: precio base', () => {
    expect(effectiveUnitPrice(CUMPLE, 10, 4).unitPrice).toBe(10);
  });

  it('desde 5 personas aplica el tier (velas)', () => {
    const r = effectiveUnitPrice(CUMPLE, 10, 5);
    expect(r.unitPrice).toBe(8);
    expect(r.variant?.description).toMatch(/velas/);
  });

  it('desde 10 gana el tier más específico (torta + pieza)', () => {
    const r = effectiveUnitPrice(CUMPLE, 10, 12);
    expect(r.unitPrice).toBe(8);
    expect(r.variant?.description).toMatch(/torta/);
  });

  it('respeta maxQty: 9 personas siguen en el tier de velas', () => {
    expect(effectiveUnitPrice(CUMPLE, 10, 9).variant?.name).toBe(
      'Grupo de 5 o más',
    );
  });

  it('las modalidades (FLAT o sin rango) no se auto-aplican', () => {
    expect(effectiveUnitPrice(ESCUELITA, 10, 8).unitPrice).toBe(10);
    expect(effectiveUnitPrice(ESCUELITA, 10, 8).variant).toBeUndefined();
  });

  it('una variante inactiva no cuenta', () => {
    const off = CUMPLE.map((v) => ({ ...v, active: false }));
    expect(effectiveUnitPrice(off, 10, 6).unitPrice).toBe(10);
  });

  describe('promos por día de semana', () => {
    // 2026-08-11 es martes (ISO 2); 2026-08-15 es sábado (ISO 6).
    const MARTES: PriceVariantLike[] = [
      { name: 'Promo martes', price: 7, unit: 'PER_PERSON', days: [2] },
    ];

    it('aplica el día que corresponde', () => {
      const r = effectiveUnitPrice(MARTES, 10, 2, '2026-08-11');
      expect(r.unitPrice).toBe(7);
      expect(r.variant?.name).toBe('Promo martes');
    });

    it('no aplica otro día', () => {
      expect(effectiveUnitPrice(MARTES, 10, 2, '2026-08-15').unitPrice).toBe(10);
    });

    it('sin fecha de contexto no aplica (mejor precio base que promo errada)', () => {
      expect(effectiveUnitPrice(MARTES, 10, 2).unitPrice).toBe(10);
    });
  });

  describe('promos por fecha', () => {
    const FECHA: PriceVariantLike[] = [
      {
        name: 'Aniversario',
        price: 5,
        unit: 'PER_PERSON',
        dateFrom: '2026-12-20',
        dateTo: '2026-12-20',
      },
      {
        name: 'Vacaciones de invierno',
        price: 8,
        unit: 'PER_PERSON',
        dateFrom: '2026-07-15',
        dateTo: '2026-07-31',
      },
    ];

    it('fecha puntual aplica sólo ese día', () => {
      expect(
        effectiveUnitPrice(FECHA, 10, 2, '2026-12-20').variant?.name,
      ).toBe('Aniversario');
      expect(effectiveUnitPrice(FECHA, 10, 2, '2026-12-21').unitPrice).toBe(10);
    });

    it('rango incluye ambos extremos', () => {
      expect(effectiveUnitPrice(FECHA, 10, 2, '2026-07-15').unitPrice).toBe(8);
      expect(effectiveUnitPrice(FECHA, 10, 2, '2026-07-31').unitPrice).toBe(8);
      expect(effectiveUnitPrice(FECHA, 10, 2, '2026-08-01').unitPrice).toBe(10);
    });
  });

  describe('condiciones combinadas y especificidad', () => {
    it('cantidad + día: exige ambas', () => {
      const v: PriceVariantLike[] = [
        {
          name: 'Martes grupal',
          price: 6,
          unit: 'PER_PERSON',
          minQty: 4,
          days: [2],
        },
      ];
      expect(effectiveUnitPrice(v, 10, 4, '2026-08-11').unitPrice).toBe(6);
      expect(effectiveUnitPrice(v, 10, 3, '2026-08-11').unitPrice).toBe(10);
      expect(effectiveUnitPrice(v, 10, 4, '2026-08-12').unitPrice).toBe(10);
    });

    it('fecha puntual le gana al día de semana y al tier por cantidad', () => {
      const v: PriceVariantLike[] = [
        { name: 'Tier 5+', price: 8, unit: 'PER_PERSON', minQty: 5 },
        { name: 'Promo martes', price: 7, unit: 'PER_PERSON', days: [2] },
        {
          name: 'Día puntual',
          price: 5,
          unit: 'PER_PERSON',
          dateFrom: '2026-08-11',
          dateTo: '2026-08-11',
        },
      ];
      const r = effectiveUnitPrice(v, 10, 6, '2026-08-11');
      expect(r.variant?.name).toBe('Día puntual');
      expect(r.unitPrice).toBe(5);
    });

    it('los tiers por cantidad siguen funcionando con fecha presente', () => {
      const r = effectiveUnitPrice(CUMPLE, 10, 12, '2026-08-15');
      expect(r.variant?.description).toMatch(/torta/);
    });
  });

  describe('lugares bonificados (freeSpots)', () => {
    // El caso real del cliente: cumpleaños martes a viernes desde 6 personas
    // → 1 lugar bonificado; sábados desde 8 → 1 lugar bonificado.
    const CUMPLE_REAL: PriceVariantLike[] = [
      {
        name: 'Semana: 1 lugar bonificado',
        price: 10,
        unit: 'PER_PERSON',
        minQty: 6,
        days: [2, 3, 4, 5],
        freeSpots: 1,
      },
      {
        name: 'Sábados: 1 lugar bonificado',
        price: 10,
        unit: 'PER_PERSON',
        minQty: 8,
        days: [6],
        freeSpots: 1,
      },
    ];

    it('sin promo se cobran todas las personas', () => {
      const r = effectiveUnitPrice(CUMPLE_REAL, 10, 6, '2026-08-16'); // domingo
      expect(r.billableQty).toBe(6);
      expect(r.variant).toBeUndefined();
    });

    it('martes con 6: entran 6, se cobran 5', () => {
      const r = effectiveUnitPrice(CUMPLE_REAL, 10, 6, '2026-08-11'); // martes
      expect(r.unitPrice).toBe(10);
      expect(r.billableQty).toBe(5);
      expect(r.variant?.name).toMatch(/Semana/);
    });

    it('sábado exige 8: con 6 no aplica, con 8 bonifica 1', () => {
      expect(
        effectiveUnitPrice(CUMPLE_REAL, 10, 6, '2026-08-15').billableQty, // sábado
      ).toBe(6);
      const r = effectiveUnitPrice(CUMPLE_REAL, 10, 8, '2026-08-15');
      expect(r.billableQty).toBe(7);
      expect(r.variant?.name).toMatch(/Sábados/);
    });

    it('billableQty nunca baja de 1', () => {
      const v: PriceVariantLike[] = [
        { name: 'Bonif', price: 10, unit: 'PER_PERSON', minQty: 1, freeSpots: 5 },
      ];
      expect(effectiveUnitPrice(v, 10, 2).billableQty).toBe(1);
    });
  });
});

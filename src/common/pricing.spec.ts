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
  it('sin variantes usa el precio base', () => {
    expect(effectiveUnitPrice([], 10, 4)).toEqual({ unitPrice: 10 });
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
});

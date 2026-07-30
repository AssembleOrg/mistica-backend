import { aliasKeys, cleanAliases, normalizeAlias } from './alias';

describe('normalizeAlias', () => {
  it('ignora mayúsculas, acentos y puntuación', () => {
    expect(normalizeAlias('Arte & Degustación')).toBe('arteydegustacion');
    expect(normalizeAlias('ARTE Y DEGUSTACION')).toBe('arteydegustacion');
    expect(normalizeAlias('arte y degustación')).toBe('arteydegustacion');
  });

  it('colapsa las abreviaturas que usa el equipo', () => {
    // El "&" cuenta como "y", así "AYD" y "A & D" son lo mismo.
    expect(normalizeAlias('AYD')).toBe('ayd');
    expect(normalizeAlias('A y D')).toBe('ayd');
    expect(normalizeAlias('a.y.d.')).toBe('ayd');
    expect(normalizeAlias('A & D')).toBe('ayd');
  });

  it('hace coincidir CyB con Cerámica & Brunch abreviada', () => {
    expect(normalizeAlias('CyB')).toBe('cyb');
    expect(normalizeAlias('C&B')).toBe('cyb');
  });

  it('tolera entradas vacías', () => {
    expect(normalizeAlias('')).toBe('');
    expect(normalizeAlias('   ')).toBe('');
    expect(normalizeAlias(undefined as unknown as string)).toBe('');
  });
});

describe('cleanAliases', () => {
  it('conserva el texto tal como lo escribió el equipo', () => {
    expect(cleanAliases(['AYD', 'Arte y Degu'])).toEqual([
      'AYD',
      'Arte y Degu',
    ]);
  });

  it('recorta espacios y descarta vacíos', () => {
    expect(cleanAliases(['  AYD  ', '', '   '])).toEqual(['AYD']);
  });

  it('descarta apodos de una sola letra (matchearían cualquier cosa)', () => {
    expect(cleanAliases(['A', 'x', 'AYD'])).toEqual(['AYD']);
  });

  it('saca repetidos aunque estén escritos distinto', () => {
    expect(cleanAliases(['AYD', 'a.y.d', 'A Y D', 'CyB'])).toEqual([
      'AYD',
      'CyB',
    ]);
  });

  it('sin apodos devuelve lista vacía', () => {
    expect(cleanAliases(undefined)).toEqual([]);
    expect(cleanAliases([])).toEqual([]);
  });
});

describe('aliasKeys', () => {
  it('incluye el nombre además de los apodos', () => {
    expect(aliasKeys('Arte & Degustación', ['AYD'])).toEqual([
      'arteydegustacion',
      'ayd',
    ]);
  });

  it('funciona sin apodos', () => {
    expect(aliasKeys('Cerámica & Brunch')).toEqual(['ceramicaybrunch']);
  });
});

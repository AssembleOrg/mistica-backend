import { signatureKey } from './students.service';

describe('Firmas de alumnos', () => {
  it('compara sin mayúsculas, tildes, espacios ni signos', () => {
    expect(signatureKey(' Emí. ')).toBe('emi');
    expect(signatureKey('E M A')).toBe('ema');
    expect(signatureKey('Ñu-2')).toBe('nu2');
  });

  it('distingue firmas parecidas pero distintas', () => {
    expect(signatureKey('EMITA')).not.toBe(signatureKey('EMA'));
  });
});

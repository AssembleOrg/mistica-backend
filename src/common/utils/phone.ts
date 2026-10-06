/** Núcleo del teléfono (sin código país 54 ni prefijo móvil 9). */
export function phoneCore(raw: string | null | undefined): string {
  let d = (raw || '').replace(/\D/g, '');
  if (d.startsWith('54')) d = d.slice(2);
  if (d.length > 10 && d.startsWith('9')) d = d.slice(1);
  return d;
}

/**
 * Regex (texto) que matchea un teléfono guardado en cualquier formato
 * ("11 3658-5581", "+54 9 11…") por sus últimos 8 dígitos, el abonado.
 * null si el número es demasiado corto para comparar.
 */
export function phoneTailPattern(raw: string | null | undefined): string | null {
  const core = phoneCore(raw);
  return core.length >= 6 ? core.slice(-8).split('').join('\\D*') : null;
}

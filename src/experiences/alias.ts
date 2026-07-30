/**
 * Apodos de las experiencias ("AYD" = Arte & Degustación, "CyB" = Cerámica &
 * Brunch). Sirven para que el bot entienda cómo las nombran los clientes y el
 * equipo, sin que el modelo tenga que adivinar.
 *
 * La normalización tiene que ser IDÉNTICA acá y en el bot (app/tools.py), o un
 * apodo que se guarda no matchea después. Regla:
 *   minúsculas → sin acentos → "&" pasa a "y" → se queda sólo [a-z0-9].
 *
 * Con eso "Arte & Degustación", "arte y degustacion" y "ARTE Y DEGUSTACION"
 * colapsan a la misma clave, y "AYD" / "A y D" / "a.y.d" colapsan a "ayd".
 */

/** Forma canónica de un texto para comparar apodos y nombres. */
export function normalizeAlias(raw: string): string {
  return (raw ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // acentos
    .toLowerCase()
    .replace(/&/g, ' y ')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Limpia la lista que manda el admin: recorta, descarta vacíos y apodos de una
 * sola letra (matchearían cualquier cosa) y saca repetidos por forma canónica,
 * conservando el texto tal como lo escribió el equipo (es lo que se muestra).
 */
export function cleanAliases(raw: string[] | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const a of raw ?? []) {
    const text = String(a ?? '').trim();
    const key = normalizeAlias(text);
    if (key.length < 2) continue; // vacío o una sola letra: no sirve
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

/** Claves canónicas de una experiencia: su nombre y todos sus apodos. */
export function aliasKeys(name: string, aliases: string[] = []): string[] {
  return [normalizeAlias(name), ...aliases.map(normalizeAlias)].filter(Boolean);
}

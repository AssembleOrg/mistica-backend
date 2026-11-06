/**
 * Qué come la gente de una reserva, para Cocina: buffet libre, merienda (se
 * sirve en la mesa, se prepara por porción) o nada. Lo define la experiencia
 * y una reserva lo puede cambiar (promo con merienda que paga el buffet aparte).
 */
export const FOOD_KINDS = ['BUFFET', 'MERIENDA', 'NONE'] as const;
export type FoodKind = (typeof FOOD_KINDS)[number];

export const FOOD_LABELS: Record<FoodKind, string> = {
  BUFFET: 'buffet libre',
  MERIENDA: 'merienda',
  NONE: 'sin comida',
};

const LOOKS_LIKE_BUFFET = /buffet|brunch|degustaci|desayuno/i;
const LOOKS_LIKE_MERIENDA = /merienda/i;

type ExperienceFoodLike = {
  name?: string;
  description?: string;
  food?: FoodKind;
  /** Viejo: «incluye buffet o merienda», de antes de separar los dos. */
  hasBuffet?: boolean;
};

/**
 * La comida de una experiencia. Sin `food` cargado se usa el tilde viejo
 * (`hasBuffet`) y, si tampoco está, se deduce del nombre y la descripción.
 */
export function experienceFood(exp: ExperienceFoodLike | null | undefined): FoodKind {
  if (exp?.food) return exp.food;
  if (exp?.hasBuffet === false) return 'NONE';
  const text = `${exp?.name ?? ''} ${exp?.description ?? ''}`;
  const guess: FoodKind | undefined = LOOKS_LIKE_BUFFET.test(text)
    ? 'BUFFET'
    : LOOKS_LIKE_MERIENDA.test(text)
      ? 'MERIENDA'
      : undefined;
  if (exp?.hasBuffet === true) return guess ?? 'BUFFET';
  return guess ?? 'NONE';
}

/** La de la reserva si la cambiaron; si no, la de su experiencia. */
export function reservationFood(
  r: { food?: FoodKind | null },
  exp: ExperienceFoodLike | null | undefined,
): FoodKind {
  return r.food ?? experienceFood(exp);
}

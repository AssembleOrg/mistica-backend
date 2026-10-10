import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ExperienceDocument = Experience & Document;

/**
 * Variante de precio de una experiencia. Dos usos:
 * · Modalidad alternativa (escuelita: "Por clase" $10 / "Mensual" $80):
 *   informativa, el bot la menciona; no se aplica sola.
 * · Promo auto-aplicable (unit=PER_PERSON + al menos una condición): se aplica
 *   SOLA al precio de la reserva cuando se cumplen TODAS sus condiciones:
 *   rango de personas (cumpleaños 5+/10+ con extras), días de semana
 *   (promo martes) y/o fecha o rango de fechas (promo del 20/12, vacaciones).
 *   Ver common/pricing.ts para la resolución.
 */
@Schema({ _id: false })
export class PriceVariant {
  // Nombre visible ('Mensual', 'Grupo de 5 o más', 'Promo martes').
  @Prop({ required: true, trim: true })
  name: string;

  // Precio en ARS. Con unit=PER_PERSON es por persona; con FLAT es un total.
  // AUSENTE = beneficio puro: mantiene el precio base sobre el que aplica
  // (los beneficios del cumpleaños rigen sobre la experiencia elegida).
  @Prop({ min: 0 })
  price?: number;

  // PER_PERSON: multiplica por la cantidad (y puede auto-aplicarse por condiciones).
  // FLAT: monto fijo de la modalidad (informativo, no se auto-aplica).
  @Prop({ required: true, enum: ['PER_PERSON', 'FLAT'], default: 'PER_PERSON' })
  unit: 'PER_PERSON' | 'FLAT';

  // Condición por cantidad de personas (sólo PER_PERSON).
  @Prop({ min: 1 })
  minQty?: number;

  @Prop({ min: 1 })
  maxQty?: number;

  // Condición por días de semana ISO (1=lunes..7=domingo). Vacío = todos.
  @Prop({ type: [Number], default: undefined })
  days?: number[];

  // Condición por fecha ('YYYY-MM-DD'). Sólo dateFrom=dateTo = fecha puntual;
  // ambos distintos = rango. Sin estos campos, rige siempre.
  @Prop({ trim: true })
  dateFrom?: string;

  @Prop({ trim: true })
  dateTo?: string;

  // Lugares que NO se cobran cuando la promo aplica ("1 lugar bonificado"):
  // el grupo entra completo pero paga (cantidad - freeSpots) personas.
  @Prop({ min: 0 })
  freeSpots?: number;

  // Qué incluye / condiciones ('incluye velas', 'torta + pieza de regalo').
  @Prop({ trim: true })
  description?: string;

  @Prop({ default: true })
  active: boolean;
}

export const PriceVariantSchema = SchemaFactory.createForClass(PriceVariant);

/**
 * Un horario PROPIO de una experiencia: día de semana + hora de inicio, todas
 * las semanas; o, con `date`, una sola vez (un evento: el Día de la Madre).
 * Ver `Experience.ownSchedule`.
 */
@Schema({ _id: false })
export class OwnSlot {
  // Día ISO (1=lunes … 7=domingo). Con `date`, el de esa fecha.
  @Prop({ required: true, min: 1, max: 7 })
  weekday: number;

  // Hora local de inicio, 'HH:mm'. La duración es la de la experiencia.
  @Prop({ required: true, trim: true })
  start: string;

  // Fecha única 'YYYY-MM-DD': el horario vale sólo ese día.
  @Prop({ trim: true })
  date?: string;
}

export const OwnSlotSchema = SchemaFactory.createForClass(OwnSlot);

/** Horario de una edición especial: hora de inicio, todos los días de la
 * edición o (con `date`) sólo ese día. */
@Schema({ _id: false })
export class SpecialSlot {
  // Hora local de inicio, 'HH:mm'. La duración es la de la experiencia.
  @Prop({ required: true, trim: true })
  start: string;

  // 'YYYY-MM-DD': el horario vale sólo ese día. Sin fecha, todos los días.
  @Prop({ trim: true })
  date?: string;
}

export const SpecialSlotSchema = SchemaFactory.createForClass(SpecialSlot);

/** Extra OPCIONAL con precio de una edición especial (lo suma el equipo). */
@Schema({ _id: false })
export class SpecialExtra {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, min: 0 })
  price: number;

  @Prop({ trim: true })
  description?: string;
}

export const SpecialExtraSchema = SchemaFactory.createForClass(SpecialExtra);

/**
 * EDICIÓN ESPECIAL de una experiencia (Halloween, Navidad…): entre `dateFrom`
 * y `dateTo` la experiencia ES esta edición — su texto, su precio, sus bonos,
 * sus extras y, si los tiene, sus horarios — y la versión normal no se ofrece
 * esos días. Fuera de esas fechas no tiene efecto: se activa y se apaga sola.
 * Ver experiences/specials.ts.
 */
@Schema({ _id: true })
export class SpecialEdition {
  _id?: Types.ObjectId;

  // Nombre de la edición ('Especial Halloween').
  @Prop({ required: true, trim: true })
  name: string;

  // Activadores del bot: cómo la piden los clientes ('halloween', 'noche de
  // brujas'). Misma normalización que los apodos (experiences/alias.ts).
  @Prop({ type: [String], default: [] })
  aliases: string[];

  // Texto de la edición: reemplaza a la descripción de la experiencia.
  @Prop({ trim: true })
  description?: string;

  // Primer y último día en que se HACE ('YYYY-MM-DD'; iguales = un solo día).
  @Prop({ required: true, trim: true })
  dateFrom: string;

  @Prop({ required: true, trim: true })
  dateTo: string;

  // Desde qué día se ofrece y se puede reservar. Antes, el bot sólo avisa
  // cuándo abren las reservas. Sin valor, se ofrece apenas se carga.
  @Prop({ trim: true })
  announceFrom?: string;

  // Precio por persona de la edición. Sin valor, el de la experiencia.
  @Prop({ min: 0 })
  price?: number;

  // Bonos de la edición (promos por cantidad, lugares bonificados…). Durante
  // la edición reemplazan a las promos habituales de la experiencia.
  @Prop({ type: [PriceVariantSchema], default: [] })
  priceVariants: PriceVariant[];

  // Lo que la edición INCLUYE sin costo ('copa de bienvenida').
  @Prop({ type: [String], default: [] })
  included: string[];

  // Extras OPCIONALES con precio: el bot los informa, los suma el equipo.
  @Prop({ type: [SpecialExtraSchema], default: [] })
  extras: SpecialExtra[];

  // Horarios especiales. Vacío = los horarios habituales de la experiencia.
  @Prop({ type: [SpecialSlotSchema], default: [] })
  schedule: SpecialSlot[];

  @Prop({ type: Boolean, default: true })
  active: boolean;
}

export const SpecialEditionSchema =
  SchemaFactory.createForClass(SpecialEdition);

/**
 * Plantilla de experiencia (taller de torno, cumpleaños, buffet+cerámica, etc.).
 * NO tiene fecha: es la definición reutilizable. Los turnos concretos (con fecha,
 * hora y cupo) viven en `ExperienceSession` y copian estos valores al crearse,
 * de modo que editar la plantilla no altera turnos ya publicados.
 */
@Schema({
  timestamps: true,
  collection: 'experiences',
})
export class Experience {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  description?: string;

  // Duración en minutos (para mostrar y calcular el fin del turno).
  @Prop({ required: true, min: 1 })
  durationMinutes: number;

  // Precio por persona (ARS). Un turno puede sobreescribirlo.
  @Prop({ required: true, min: 0 })
  basePrice: number;

  // Cupo por defecto al generar turnos. Cada turno guarda su propio `capacity`.
  @Prop({ required: true, min: 1 })
  defaultCapacity: number;

  // Porcentaje de SEÑA que se cobra al reservar (el resto es saldo pendiente).
  // En Mística toda reserva es con seña del 50%. 100 = se cobra el total.
  @Prop({ required: true, min: 0, max: 100, default: 50 })
  depositPct: number;

  // Color hex (#RRGGBB) para identificar la experiencia en la agenda.
  // Obligatorio; docs viejos se backfillean con scripts/backfill-experience-colors.js.
  @Prop({ required: true, trim: true, default: '#9d684e' })
  color: string;

  @Prop({ type: [String], default: [] })
  images: string[];

  /**
   * Apodos y abreviaturas con los que clientes y equipo nombran la experiencia
   * ("AYD", "arte y degu"). Los usa el bot para entender de qué le hablan sin
   * adivinar. Se guardan tal como los escribe el equipo; la comparación es
   * insensible a mayúsculas, acentos y puntuación (ver experiences/alias.ts).
   */
  @Prop({ type: [String], default: [] })
  aliases: string[];

  // Variantes de precio (modalidades y tiers por cantidad). Ver PriceVariant.
  @Prop({ type: [PriceVariantSchema], default: [] })
  priceVariants: PriceVariant[];

  /**
   * HORARIO PROPIO: si tiene al menos uno, la experiencia se ofrece SÓLO en
   * estos días y horas, y NO en los turnos generales del salón (ej. Escuelita:
   * miércoles 18:00). Vacío = usa los turnos generales (el caso normal).
   *
   * En su horario propio la capacidad es el CUPO de la experiencia
   * (defaultCapacity), no las mesas: el lugar físico lo aparta un bloqueo
   * semanal de mesas (recurring_blocks). Por eso esas reservas no se asignan a
   * mesas.
   */
  @Prop({ type: [OwnSlotSchema], default: [] })
  ownSchedule: OwnSlot[];

  // Ediciones especiales por fecha (Halloween, Navidad…). Ver SpecialEdition.
  @Prop({ type: [SpecialEditionSchema], default: [] })
  specials: SpecialEdition[];

  // ¿Se reserva online por acá (genera turnos + seña)? Si es false, es un
  // servicio que se COORDINA: el bot/web solo informa y capta la consulta
  // (mensuales, eventos, escuelita, facilitadores, tienda). Default true.
  @Prop({ type: Boolean, default: true })
  bookableOnline: boolean;

  /**
   * Marca el doc "Cumpleaños": una OCASIÓN, no una experiencia reservable.
   * No tiene precio ni duración propios — el cumpleañero elige una de las
   * experiencias reservables y hereda su precio y duración; este doc aporta
   * la descripción, los apodos y los BENEFICIOS (priceVariants, en general
   * sin `price`: lugares bonificados y regalos sobre el precio heredado).
   * Debe haber a lo sumo uno con true.
   */
  @Prop({ type: Boolean, default: false })
  isBirthday: boolean;

  // Lugares FIJOS del salón que ocupa un turno abierto de esta experiencia,
  // independiente de los anotados (ej. la mesa grande del taller = 10: no se
  // puede mover, resta capacidad aunque haya menos inscriptos). 0 = ninguno,
  // el control del salón usa los anotados (seatsTaken).
  @Prop({ required: true, min: 0, default: 0 })
  venueSeats: number;

  // ¿Incluye buffet/merienda? Para la vista de Cocina: cuenta a sus personas.
  // Sin valor, cocina lo deduce del nombre y la descripción (buffet, brunch…).
  @Prop({ type: Boolean })
  hasBuffet?: boolean;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;

  @Prop({ type: Date })
  deletedAt?: Date;
}

export const ExperienceSchema = SchemaFactory.createForClass(Experience);

ExperienceSchema.index({ isActive: 1 });
ExperienceSchema.index({ deletedAt: 1 });
ExperienceSchema.index({ name: 1 });

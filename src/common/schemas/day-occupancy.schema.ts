import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

export type DayOccupancyDocument = DayOccupancy & Document;

/**
 * Ocupación de mesas de UN día. Es el documento sobre el que se hace el control
 * de concurrencia de la asignación de mesas.
 *
 * CONTROL DE CONCURRENCIA (sin transacciones, mongod standalone):
 * todas las mesas de un día viven en este único documento, así que asignar N
 * mesas a una reserva es UN update con guarda
 * `slots: { $not: { $elemMatch: { table: { $in: codes },
 *   startAt: { $lt: busyUntil }, busyUntil: { $gt: startAt } } } }`
 * y un `$push` de los N slots. MongoDB serializa las escrituras al mismo
 * documento, por lo que la asignación es atómica y todo-o-nada: es imposible
 * que dos reservas se queden con la misma mesa, ni que una reserva se quede
 * con la mitad de las mesas que pidió.
 *
 * El bloqueo es POR INTERVALO: la mesa queda ocupada de `startAt` a
 * `busyUntil` (= endAt + minutos de limpieza). Dos reservas pueden usar la
 * misma mesa el mismo día siempre que sus intervalos no se pisen.
 */
@Schema({ _id: false })
export class OccupancySlot {
  // Código de la mesa ocupada ('M1', 'G1').
  @Prop({ required: true, trim: true, uppercase: true })
  table: string;

  // Reserva que ocupa la mesa. Vacío si es un bloqueo manual del admin
  // (taller, evento, mesa rota).
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Reservation' })
  reservationId?: Types.ObjectId;

  // Personas de la reserva. Se guarda acá para poder evaluar si una mesa grande
  // admite compartirse sin ir a buscar la reserva.
  @Prop({ required: true, min: 0, default: 0 })
  qty: number;

  // Inicio de la actividad en la mesa.
  @Prop({ type: Date, required: true })
  startAt: Date;

  // Fin de la actividad (lo que ve el cliente / la agenda).
  @Prop({ type: Date, required: true })
  endAt: Date;

  // Hasta cuándo la mesa queda tomada: endAt + limpieza. Es el borde que usa
  // la guarda de concurrencia; la próxima reserva puede arrancar recién acá.
  @Prop({ type: Date, required: true })
  busyUntil: Date;

  // true si la mesa grande se comparte con otra reserva.
  @Prop({ type: Boolean, default: false })
  shared: boolean;

  // Etiqueta del bloqueo manual ('Taller mensual', 'Mesa rota').
  @Prop({ trim: true })
  label?: string;

  // Clave del turno del modelo viejo ('T1'). Sólo en slots anteriores al
  // modelo por intervalos; no se escribe más.
  @Prop({ trim: true })
  shift?: string;
}

export const OccupancySlotSchema = SchemaFactory.createForClass(OccupancySlot);

@Schema({ timestamps: true, collection: 'day_occupancy' })
export class DayOccupancy {
  // Fecha de negocio 'YYYY-MM-DD' en hora de Argentina. Única: un doc por día.
  @Prop({ required: true, unique: true, trim: true })
  date: string;

  @Prop({ type: [OccupancySlotSchema], default: [] })
  slots: OccupancySlot[];
}

export const DayOccupancySchema = SchemaFactory.createForClass(DayOccupancy);

// date ya tiene índice único por @Prop({ unique: true }).
DayOccupancySchema.index({ 'slots.reservationId': 1 });

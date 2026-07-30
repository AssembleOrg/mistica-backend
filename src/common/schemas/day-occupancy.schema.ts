import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

export type DayOccupancyDocument = DayOccupancy & Document;

/**
 * Ocupación de mesas de UN día. Es el documento sobre el que se hace el control
 * de concurrencia de la asignación de mesas.
 *
 * CONTROL DE CONCURRENCIA (sin transacciones, mongod standalone):
 * todas las mesas de un día viven en este único documento, así que asignar N
 * mesas a una reserva es UN `findOneAndUpdate` con guarda
 * `slots: { $not: { $elemMatch: { shift, table: { $in: codes } } } }` y un
 * `$push` de los N slots. MongoDB serializa las escrituras al mismo documento,
 * por lo que la asignación es atómica y todo-o-nada: es imposible que dos
 * reservas se queden con la misma mesa, ni que una reserva se quede con la
 * mitad de las mesas que pidió.
 *
 * El bloqueo es POR TURNO: una mesa ocupada en T1 vuelve al pool en T2. El
 * tiempo de limpieza está en el hueco entre turnos (ver shifts.ts).
 */
@Schema({ _id: false })
export class OccupancySlot {
  // Clave del turno ('T1', 'T2').
  @Prop({ required: true, trim: true })
  shift: string;

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

  // Horario real de la actividad dentro del turno (para mostrar en la agenda).
  @Prop({ type: Date })
  startAt?: Date;

  @Prop({ type: Date })
  endAt?: Date;

  // true si la mesa grande se comparte con otra reserva.
  @Prop({ type: Boolean, default: false })
  shared: boolean;

  // Etiqueta del bloqueo manual ('Taller mensual', 'Mesa rota').
  @Prop({ trim: true })
  label?: string;
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

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

/** Hornos del taller. */
export const KILNS = {
  SUPERIOR: 'Carga superior',
  FRONTAL: 'Carga frontal',
} as const;
export type KilnKey = keyof typeof KILNS;

/** Prender el horno, o apagarlo y descargarlo. */
export const KILN_ACTIONS = {
  ON: 'Prendido',
  OFF: 'Apagado y descargado',
} as const;
export type KilnAction = keyof typeof KILN_ACTIONS;

export type KilnLogDocument = KilnLog & Document;

/**
 * Registro de uso de los hornos: quién prendió o apagó y descargó cuál y
 * cuándo. Sin detalle de lo que se horneó: sirve para ver cuántas veces se
 * prendió en la semana y si algún día se olvidaron.
 */
@Schema({ timestamps: true, collection: 'kiln_logs' })
export class KilnLog {
  @Prop({ required: true, enum: Object.keys(KILNS) })
  kiln: KilnKey;

  @Prop({ required: true, enum: Object.keys(KILN_ACTIONS) })
  action: KilnAction;

  @Prop({ required: true, type: Date })
  at: Date;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  userId?: Types.ObjectId;

  /** Quién (la persona, en las cuentas compartidas). */
  @Prop({ trim: true })
  byName?: string;

  @Prop({ trim: true })
  note?: string;

  @Prop({ type: Date })
  deletedAt?: Date;
}

export const KilnLogSchema = SchemaFactory.createForClass(KilnLog);
KilnLogSchema.index({ at: -1 });

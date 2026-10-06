import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

export type TrialClassDocument = TrialClass & Document;

/**
 * Clase de prueba agendada: alguien que todavía no es alumno viene a probar un
 * grupo del taller un día puntual. La profe la ve (en el grupo, en la
 * asistencia de ese día y en la agenda) y no genera cuota: la persona no está
 * en el grupo hasta que se inscribe, y ahí arranca su mes.
 */
@Schema({ timestamps: true, collection: 'trial_classes' })
export class TrialClass {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Group', required: true })
  groupId: Types.ObjectId;

  /** Día de la clase ('YYYY-MM-DD'). */
  @Prop({ required: true, trim: true })
  date: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Student', required: true })
  studentId: Types.ObjectId;

  @Prop({ trim: true })
  notes?: string;

  /** Quién la agendó (en las cuentas compartidas, la persona elegida). */
  @Prop({ trim: true })
  createdByName?: string;

  /** Se inscribió en el grupo después de probar. */
  @Prop({ type: Date })
  enrolledAt?: Date;
}

export const TrialClassSchema = SchemaFactory.createForClass(TrialClass);

TrialClassSchema.index({ date: 1, groupId: 1 });
TrialClassSchema.index({ studentId: 1 });

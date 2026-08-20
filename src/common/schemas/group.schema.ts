import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

export type GroupDocument = Group & Document;

/**
 * Franja horaria semanal de un grupo (día ISO 1=lunes..7=domingo + rango).
 * Un grupo puede cursar más de un día por semana.
 */
@Schema({ _id: false })
export class GroupSlot {
  @Prop({ required: true, min: 1, max: 7 })
  weekday: number;

  // 'HH:mm'
  @Prop({ required: true, trim: true })
  start: string;

  @Prop({ required: true, trim: true })
  end: string;
}

export const GroupSlotSchema = SchemaFactory.createForClass(GroupSlot);

/**
 * Grupo / taller / clase del establecimiento (taller mensual, escuelita,
 * grupos del profesor). Lo crea y administra el PROFESOR (o el admin): tiene
 * nombre, descripción, días y horarios, y los alumnos asociados. La asistencia
 * y el seguimiento práctico cuelgan de acá.
 */
@Schema({ timestamps: true, collection: 'groups' })
export class Group {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  description?: string;

  // Profesor a cargo (opcional: un grupo puede quedar sin profesor asignado).
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Professor' })
  professorId?: Types.ObjectId;

  // Snapshot para listar sin join.
  @Prop({ trim: true })
  professorName?: string;

  @Prop({ type: [GroupSlotSchema], default: [] })
  schedule: GroupSlot[];

  // Alumnos que cursan en este grupo.
  @Prop({ type: [SchemaTypes.ObjectId], ref: 'Student', default: [] })
  studentIds: Types.ObjectId[];

  // Información relacionada con la actividad (materiales, temario, etc.).
  @Prop({ trim: true })
  notes?: string;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: Date })
  deletedAt?: Date;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;
}

export const GroupSchema = SchemaFactory.createForClass(Group);

GroupSchema.index({ deletedAt: 1, isActive: 1 });
GroupSchema.index({ professorId: 1 });

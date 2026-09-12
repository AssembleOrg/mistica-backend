import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

export type ProfessorDocument = Professor & Document;

/**
 * Profesor del taller: quien acompaña las piezas por el proceso del horno.
 * Cada pieza se le asigna a un profesor; el profesor puede tener una cuenta
 * de acceso al panel (User) con la vista de piezas habilitada.
 */
@Schema({ timestamps: true, collection: 'professors' })
export class Professor {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ trim: true })
  emergencyPhone?: string;

  @Prop({ trim: true, lowercase: true })
  email?: string;

  @Prop({ trim: true })
  notes?: string;

  // Cuenta de acceso al panel vinculada (si se le creó una).
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  userId?: Types.ObjectId;

  @Prop({ default: true })
  active: boolean;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;

  @Prop({ type: Date })
  deletedAt?: Date;
}

export const ProfessorSchema = SchemaFactory.createForClass(Professor);

ProfessorSchema.index({ active: 1, deletedAt: 1 });

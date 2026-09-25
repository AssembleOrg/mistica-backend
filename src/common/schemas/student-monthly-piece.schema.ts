import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

export type StudentMonthlyPieceDocument = StudentMonthlyPiece & Document;

/**
 * Pieza del mes de un alumno del taller. Cada mes el alumno elige UNA pieza
 * (fresca o bizcochada); si es más grande corresponde un adicional. Reemplaza
 * la planilla "coladas del mes": una fila por alumno y mes.
 */
@Schema({ timestamps: true, collection: 'student_monthly_pieces' })
export class StudentMonthlyPiece {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Student', required: true })
  studentId: Types.ObjectId;

  /** 'YYYY-MM'. */
  @Prop({ required: true, trim: true })
  month: string;

  /** Qué pieza pidió ("tazón XL", "tartera"). */
  @Prop({ trim: true, default: '' })
  pieceName: string;

  /** true = la pide en bizcocho; false = fresca. */
  @Prop({ type: Boolean, default: false })
  bisque: boolean;

  @Prop({ type: Boolean, default: false })
  delivered: boolean;

  /** Pieza más grande: corresponde cobrar un adicional. */
  @Prop({ type: Boolean, default: false })
  extraCharge: boolean;

  @Prop({ type: Number, min: 0 })
  extraAmount?: number;

  /** El adicional ya se cobró. */
  @Prop({ type: Boolean, default: false })
  paid: boolean;

  @Prop({ trim: true })
  notes?: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  updatedById?: Types.ObjectId;
}

export const StudentMonthlyPieceSchema =
  SchemaFactory.createForClass(StudentMonthlyPiece);

StudentMonthlyPieceSchema.index({ studentId: 1, month: 1 }, { unique: true });
StudentMonthlyPieceSchema.index({ month: 1 });

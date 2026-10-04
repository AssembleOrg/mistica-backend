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

  /** La pide en bizcocho. Excluyente con `fresh`; las dos apagadas = sin elegir. */
  @Prop({ type: Boolean, default: false })
  bisque: boolean;

  /**
   * La pide fresca. Sin default: en las filas viejas falta y se deduce de
   * `bisque` (antes "bizcocho apagado = fresca").
   */
  @Prop({ type: Boolean })
  fresh?: boolean;

  /** Cuándo la pidió (se fija al cargar la pieza). Ordena la lista de producción. */
  @Prop({ type: Date })
  requestedAt?: Date;

  /** Para qué clase la quiere ('YYYY-MM-DD'): no siempre es la próxima. */
  @Prop({ trim: true })
  dueDate?: string;

  /** Producción la terminó (lista para entregar). Distinto de `delivered`. */
  @Prop({ type: Boolean, default: false })
  ready: boolean;

  @Prop({ type: Date })
  readyAt?: Date;

  /** Ya se avisó a Producción. */
  @Prop({ type: Date })
  notifiedAt?: Date;

  @Prop({ type: Boolean, default: false })
  delivered: boolean;

  /** Pieza más grande: corresponde cobrar un adicional. */
  @Prop({ type: Boolean, default: false })
  extraCharge: boolean;

  @Prop({ type: Number, min: 0 })
  extraAmount?: number;

  /** El adicional ya se cobró (genera un pago del alumno). */
  @Prop({ type: Boolean, default: false })
  paid: boolean;

  /** Pago del alumno creado al marcar cobrado. Se anula si se deshace. */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'StudentPayment' })
  paymentId?: Types.ObjectId;

  /** Cuándo se marcó cobrado: el cobro se puede deshacer 24 hs. */
  @Prop({ type: Date })
  paidAt?: Date;

  @Prop({ trim: true })
  notes?: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  updatedById?: Types.ObjectId;
}

export const StudentMonthlyPieceSchema =
  SchemaFactory.createForClass(StudentMonthlyPiece);

StudentMonthlyPieceSchema.index({ studentId: 1, month: 1 }, { unique: true });
StudentMonthlyPieceSchema.index({ month: 1 });

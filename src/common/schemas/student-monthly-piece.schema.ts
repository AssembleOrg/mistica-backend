import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

export type StudentMonthlyPieceDocument = StudentMonthlyPiece & Document;

/**
 * Pieza del mes de un alumno del taller (fresca o bizcochada). Reemplaza la
 * planilla "coladas del mes". Cada mes elige una; puede pedir más, y las de
 * más (o las de categoría especial/premium) llevan adicional.
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

  /** Pieza del catálogo (el mismo de las fichas de reservas), si se eligió de ahí. */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'PieceType' })
  pieceTypeId?: Types.ObjectId;

  /** Categoría de la pieza al elegirla (Especial, Premium…): define el adicional. */
  @Prop({ trim: true })
  category?: string;

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

  /** Adicional bonificado (p. ej. por una clase que no pudo recuperar): no se cobra. */
  @Prop({ type: Boolean })
  waived?: boolean;

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

  // Quién hizo el último cambio (la persona: en las cuentas compartidas se
  // elige; si no, el nombre de la cuenta).
  @Prop({ trim: true })
  updatedByName?: string;
}

export const StudentMonthlyPieceSchema =
  SchemaFactory.createForClass(StudentMonthlyPiece);

// Varias por alumno y mes (antes había un índice único, se borra al arrancar).
StudentMonthlyPieceSchema.index({ studentId: 1, month: 1, createdAt: 1 });
StudentMonthlyPieceSchema.index({ month: 1 });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

export type PieceDraftDocument = PieceDraft & Document;

/** Una ficha a medio cargar (los mismos campos que el formulario). */
export interface PieceDraftEntry {
  personName?: string;
  signature?: string;
  pieceType?: string;
  colorsUsed?: string;
  hasExtra?: boolean;
  extraId?: string;
  pieceType2?: string;
  additional?: boolean;
  /** Orden de la ficha en el formulario. */
  order: number;
  updatedBy?: string;
  updatedAt: Date;
}

/**
 * Borrador de las fichas de piezas de una reserva: se guarda ficha por ficha
 * mientras se escribe, para que nada se pierda al cerrar el formulario, y se
 * comparte entre las tablets y los celulares. Cada ficha se guarda por su
 * clave, así dos personas cargando la misma reserva no se pisan. Al
 * registrar, las fichas registradas salen del borrador.
 */
@Schema({ timestamps: true, collection: 'piece_drafts' })
export class PieceDraft {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Reservation', required: true })
  reservationId: Types.ObjectId;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  entries: Record<string, PieceDraftEntry>;
}

export const PieceDraftSchema = SchemaFactory.createForClass(PieceDraft);
PieceDraftSchema.index({ reservationId: 1 }, { unique: true });

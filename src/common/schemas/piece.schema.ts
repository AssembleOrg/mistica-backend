import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';
import { PieceStatus } from '../enums/piece.enum';

export type PieceDocument = Piece & Document;

/**
 * Pieza de cerámica que un cliente creó en una experiencia y que pasa por el
 * horno hasta quedar lista para retirar. Se carga a mano desde el panel y el
 * equipo avanza su estado. El bot la consulta por teléfono ("¿ya están mis
 * piezas?") y, cuando queda LISTA, se avisa por WhatsApp (una sola vez).
 */
@Schema({ timestamps: true, collection: 'pieces' })
export class Piece {
  // Teléfono del cliente (para el match del bot y el aviso).
  @Prop({ required: true, trim: true })
  customerPhone: string;

  @Prop({ trim: true })
  customerName?: string;

  // Experiencia de la que salió la pieza (snapshot, texto libre).
  @Prop({ trim: true })
  experienceName?: string;

  // Cuántas piezas agrupa este registro.
  @Prop({ required: true, min: 1, default: 1 })
  quantity: number;

  @Prop({ required: true, enum: PieceStatus, default: PieceStatus.SECADO })
  status: PieceStatus;

  @Prop({ trim: true })
  notes?: string;

  // Link opcional a la reserva de origen (si vino de una).
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Reservation' })
  reservationId?: Types.ObjectId;

  // Momento en que pasó a LISTA / RETIRADA.
  @Prop({ type: Date })
  readyAt?: Date;

  @Prop({ type: Date })
  pickedUpAt?: Date;

  // Idempotencia del aviso de "lista": se setea al mandar el WhatsApp.
  @Prop({ type: Date })
  notifiedReadyAt?: Date;

  @Prop({ type: Date })
  deletedAt?: Date;
}

export const PieceSchema = SchemaFactory.createForClass(Piece);

PieceSchema.index({ customerPhone: 1 });
PieceSchema.index({ status: 1 });
PieceSchema.index({ deletedAt: 1 });

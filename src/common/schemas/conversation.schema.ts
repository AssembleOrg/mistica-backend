import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

export type ConversationDocument = Conversation & Document;

/**
 * Estado de una charla derivada a una persona del equipo.
 *
 * WAITING: el cliente pidió hablar con alguien y todavía no lo atendieron.
 * HUMAN:   alguien del equipo la tomó y está respondiendo.
 * CLOSED:  el equipo la dio por terminada y el bot volvió a atender.
 */
export type ConversationStatus = 'WAITING' | 'HUMAN' | 'CLOSED';

/**
 * Charla con una persona real. El cliente puede pedir hablar con alguien del
 * equipo: mientras la charla está abierta el bot NO responde ese chat, y todo
 * lo que se dicen queda persistido como constancia.
 *
 * Hay como mucho UNA conversación abierta por teléfono (índice único parcial):
 * si el cliente vuelve a pedir ayuda mientras ya está esperando, se reusa la
 * que ya existe en vez de abrir otra.
 */
@Schema({ timestamps: true, collection: 'conversations' })
export class Conversation {
  // Teléfono del cliente (dígitos, como lo manda el bot). Clave del chat.
  @Prop({ required: true, trim: true, index: true })
  phone: string;

  @Prop({ trim: true })
  customerName?: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Client' })
  clientId?: Types.ObjectId;

  @Prop({
    required: true,
    enum: ['WAITING', 'HUMAN', 'CLOSED'],
    default: 'WAITING',
  })
  status: ConversationStatus;

  // Por qué pidió hablar con alguien (lo resume el bot).
  @Prop({ trim: true })
  reason?: string;

  @Prop({ type: Date, default: Date.now })
  requestedAt: Date;

  // Quién la está atendiendo.
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  takenById?: Types.ObjectId;

  @Prop({ trim: true })
  takenByName?: string;

  @Prop({ type: Date })
  takenAt?: Date;

  @Prop({ type: Date })
  closedAt?: Date;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  closedById?: Types.ObjectId;

  // Para ordenar la bandeja y marcar lo que el equipo todavía no leyó.
  @Prop({ type: Date, default: Date.now })
  lastMessageAt: Date;

  @Prop({ trim: true })
  lastMessagePreview?: string;

  @Prop({ required: true, min: 0, default: 0 })
  unreadForAdmin: number;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);

// Una sola charla abierta por teléfono. Las cerradas quedan como historial.
ConversationSchema.index(
  { phone: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['WAITING', 'HUMAN'] } },
  },
);
ConversationSchema.index({ status: 1, lastMessageAt: -1 });

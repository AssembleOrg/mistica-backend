import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

export type ConversationDocument = Conversation & Document;

/**
 * Estado de una charla.
 *
 * BOT:     la atiende el bot. Se persiste turno a turno como constancia; el bot
 *          sigue respondiendo (no está pausado). Es el estado de toda consulta
 *          que entra por WhatsApp mientras nadie del equipo intervino.
 * WAITING: el cliente pidió hablar con alguien y todavía no lo atendieron.
 * HUMAN:   alguien del equipo la tomó y está respondiendo.
 * CLOSED:  terminada (el equipo la cerró, o venció la sesión del bot).
 */
export type ConversationStatus = 'BOT' | 'WAITING' | 'HUMAN' | 'CLOSED';

/** Estados en los que la charla está viva (una sola por teléfono). */
export const ACTIVE_CONVERSATION_STATUSES: ConversationStatus[] = [
  'BOT',
  'WAITING',
  'HUMAN',
];

/**
 * Una charla del cliente por WhatsApp: toda consulta con el bot queda acá,
 * turno a turno. Si el cliente pide hablar con una persona, la MISMA charla
 * pasa de BOT a WAITING/HUMAN (el bot se calla) y sigue el mismo hilo; al
 * cerrarla el bot vuelve a atender. Todo queda persistido como constancia.
 *
 * Hay como mucho UNA charla viva por teléfono (índice único parcial): mientras
 * está abierta se reusa en vez de abrir otra. Al vencer la sesión (sin
 * actividad) se cierra y la próxima vez arranca una charla nueva.
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
    enum: ['BOT', 'WAITING', 'HUMAN', 'CLOSED'],
    default: 'WAITING',
  })
  status: ConversationStatus;

  // Etiqueta del tema de la consulta (lo detecta el bot): "Cumpleaños",
  // "Taller mensual", "Reserva", etc. Reemplaza la vieja sección de leads:
  // la intención queda como rótulo de la charla, no como registro aparte.
  @Prop({ trim: true })
  intent?: string;

  // Etiquetas libres para filtrar la bandeja (servicio, campaña, etc.).
  @Prop({ type: [String], default: undefined })
  tags?: string[];

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

// Una sola charla VIVA por teléfono (bot o en handoff). Las cerradas quedan
// como historial y no cuentan para el índice único.
ConversationSchema.index(
  { phone: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ['BOT', 'WAITING', 'HUMAN'] },
    },
  },
);
ConversationSchema.index({ status: 1, lastMessageAt: -1 });
ConversationSchema.index({ lastMessageAt: -1 });

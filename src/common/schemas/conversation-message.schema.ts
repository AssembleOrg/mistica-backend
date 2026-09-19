import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

export type ConversationMessageDocument = ConversationMessage & Document;

/** Quién escribió: el cliente, el bot (contexto previo) o alguien del equipo. */
export type MessageAuthor = 'CLIENT' | 'BOT' | 'ADMIN';

/**
 * Un mensaje dentro de una charla con una persona del equipo.
 *
 * Se guardan en colección aparte (no embebidos) porque una charla puede
 * estirarse y no queremos un documento que crezca sin techo.
 *
 * Al abrir la charla se vuelca también el tramo reciente de lo que la persona
 * venía hablando con el bot, marcado como CLIENT/BOT: quien atiende necesita
 * ver el contexto, no empezar a ciegas.
 */
@Schema({ timestamps: true, collection: 'conversation_messages' })
export class ConversationMessage {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true,
  })
  conversationId: Types.ObjectId;

  @Prop({ required: true, enum: ['CLIENT', 'BOT', 'ADMIN'] })
  author: MessageAuthor;

  // Nombre de quien del equipo respondió (para la constancia).
  @Prop({ trim: true })
  authorName?: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  authorUserId?: Types.ObjectId;

  // Texto del mensaje. Puede venir vacío si el mensaje es sólo un adjunto
  // (imagen/documento): en ese caso el "cuerpo" es el archivo.
  @Prop({ trim: true, default: '' })
  body: string;

  // ── Adjunto (imagen o documento que mandó el cliente) ──
  // Key privado en Spaces. La imagen/archivo NUNCA es pública: el panel la ve
  // con URL firmada de corta vida. Vacío = sin adjunto (mensaje de texto).
  @Prop({ trim: true })
  mediaKey?: string;

  @Prop({ enum: ['image', 'document'] })
  mediaKind?: 'image' | 'document';

  @Prop({ trim: true })
  mediaMime?: string;

  // Nombre original del archivo (documentos): para mostrarlo y descargarlo.
  @Prop({ trim: true })
  mediaName?: string;

  @Prop({ type: Number, min: 0 })
  mediaSize?: number;

  // Sólo para los mensajes salientes: si el envío por WhatsApp falló, queda
  // registrado para que el equipo lo reintente en vez de creer que llegó.
  @Prop({ type: Boolean })
  delivered?: boolean;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;
}

export const ConversationMessageSchema =
  SchemaFactory.createForClass(ConversationMessage);

ConversationMessageSchema.index({ conversationId: 1, createdAt: 1 });

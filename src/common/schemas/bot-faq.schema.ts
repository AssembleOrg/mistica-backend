import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BotFaqDocument = BotFaq & Document;

/**
 * Pregunta frecuente / política del bot. No se responde literal: se inyecta al
 * prompt como "política definida" y Ariadna la usa con su tono. Es lo que el
 * dueño edita para que el bot conteste distinto sin tocar código.
 */
@Schema({ timestamps: true, collection: 'bot_faqs' })
export class BotFaq {
  /** Tema / pregunta, en una línea ("¿Hacen gift cards?"). */
  @Prop({ required: true, trim: true })
  title: string;

  /** Formas en que la gente lo pregunta (ayudan al bot a reconocerlo). */
  @Prop({ type: [String], default: [] })
  examples: string[];

  /** Qué tiene que responder / la política, en texto. */
  @Prop({ required: true })
  answer: string;

  @Prop({ type: Boolean, default: true })
  active: boolean;

  @Prop({ type: Number, default: 0 })
  order: number;
}

export const BotFaqSchema = SchemaFactory.createForClass(BotFaq);
BotFaqSchema.index({ order: 1, createdAt: 1 });

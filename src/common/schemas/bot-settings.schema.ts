import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BotSettingsDocument = BotSettings & Document;

/** Datos fijos del negocio que el bot recita (nunca los inventa el LLM). */
export interface BotBusiness {
  name: string;
  address: string;
  maps: string;
  hours: string;
  instagram: string;
  facebook: string;
}

/** Datos bancarios para la seña por transferencia. */
export interface BotTransfer {
  alias: string;
  ownerName: string;
  ownerCuit: string;
  bank: string;
}

/** Textos fijos del bot (no pasan por el LLM). Editables desde el panel. */
export interface BotTexts {
  greeting: string;
  farewell: string;
  error: string;
  audioFail: string;
  rateLimit: string;
  safeFallback: string;
  jailbreakRefusal: string;
  transferNotReceipt: string;
  transferReview: string;
  transferOrphan: string;
  transferExpired: string;
  botOff: string;
}

/**
 * Configuración del bot de WhatsApp: UNA sola fila (`key: 'default'`). El bot
 * la lee cada minuto (GET interno con X-Bot-Secret), así los cambios del
 * panel aplican sin redeploy.
 */
@Schema({ timestamps: true, collection: 'bot_settings' })
export class BotSettings {
  @Prop({ required: true, unique: true, default: 'default' })
  key: string;

  /** Apagado: el bot no responde; cada charla nueva pasa al equipo. */
  @Prop({ type: Boolean, default: true })
  botActive: boolean;

  @Prop({ type: Object, default: {} })
  business: BotBusiness;

  @Prop({ type: Object, default: {} })
  transfer: BotTransfer;

  @Prop({ type: Object, default: {} })
  texts: BotTexts;
}

export const BotSettingsSchema = SchemaFactory.createForClass(BotSettings);

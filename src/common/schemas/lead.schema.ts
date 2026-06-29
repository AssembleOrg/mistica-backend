import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';
import { LeadSource, LeadStatus } from '../enums/lead.enum';

export type LeadDocument = Lead & Document;

/**
 * Consulta/lead para servicios que NO se auto-reservan online (cumpleaños,
 * eventos, talleres mensuales, escuelita, facilitadores, tienda). El bot/web la
 * captan con los datos clave y el equipo de Mística la sigue desde el admin.
 *
 * No descuenta cupo ni cobra: es captura de intención + contacto.
 */
@Schema({ timestamps: true, collection: 'leads' })
export class Lead {
  // Servicio/experiencia consultada (texto libre, ej. "Cumpleaños",
  // "Taller mensual de cerámica", "Escuelita de arte").
  @Prop({ required: true, trim: true })
  service: string;

  // Opcional: vínculo a una Experience del catálogo si aplica.
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Experience' })
  experienceId?: Types.ObjectId;

  // Fecha tentativa en texto libre ("el 12/7", "algún sábado de julio").
  @Prop({ trim: true })
  preferredDate?: string;

  // Cantidad de personas estimada.
  @Prop({ min: 1 })
  quantity?: number;

  @Prop({ required: true, trim: true })
  customerName: string;

  @Prop({ lowercase: true, trim: true })
  customerEmail?: string;

  @Prop({ trim: true })
  customerPhone?: string;

  @Prop({ required: true, enum: LeadSource, default: LeadSource.WHATSAPP })
  source: LeadSource;

  @Prop({ required: true, enum: LeadStatus, default: LeadStatus.NEW })
  status: LeadStatus;

  @Prop({ trim: true })
  notes?: string;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;

  @Prop({ type: Date })
  deletedAt?: Date;
}

export const LeadSchema = SchemaFactory.createForClass(Lead);

LeadSchema.index({ status: 1 });
LeadSchema.index({ source: 1 });
LeadSchema.index({ createdAt: -1 });
LeadSchema.index({ deletedAt: 1 });

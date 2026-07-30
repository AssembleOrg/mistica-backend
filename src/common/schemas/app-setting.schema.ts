import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AppSettingDocument = AppSetting & Document;

/**
 * Almacén clave-valor para ajustes globales de la app que deben persistir en
 * DB (no en variables de entorno) porque el dueño los edita desde la interfaz.
 *
 * Hoy guarda el hash del PIN para borrar egresos (`cashDeletePinHash`). El
 * `value` SIEMPRE va hasheado cuando es un secreto: nunca se guarda ni se
 * devuelve al frontend en texto plano.
 */
@Schema({
  timestamps: true,
  collection: 'app_settings',
})
export class AppSetting {
  @Prop({ required: true, unique: true, trim: true })
  key: string;

  @Prop({ required: true })
  value: string;
}

export const AppSettingSchema = SchemaFactory.createForClass(AppSetting);

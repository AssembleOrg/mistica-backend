import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ClientLabelDocument = ClientLabel & Document;

@Schema({ timestamps: true, collection: 'clientLabels' })
export class ClientLabel {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  color?: string;

  @Prop({ type: Date })
  deletedAt?: Date;
}

export const ClientLabelSchema = SchemaFactory.createForClass(ClientLabel);
ClientLabelSchema.index({ deletedAt: 1 });

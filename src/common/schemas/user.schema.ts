import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { UserRole } from '../enums';

export type UserDocument = User & Document;

@Schema({ 
  timestamps: true,
  collection: 'users' 
})
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true })
  password: string;

  @Prop({ required: true, enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @Prop({ trim: true })
  avatar?: string;

  // Vistas del panel habilitadas para esta cuenta (claves de ruta: 'sales',
  // 'reservas', 'clients'…). Vacío/ausente = acceso estándar según el rol.
  // Con lista, es una whitelist: la cuenta sólo ve esas vistas. Los admin la
  // ignoran (ven todo).
  @Prop({ type: [String], default: undefined })
  allowedViews?: string[];

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;

  @Prop({ type: Date })
  deletedAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Add indexes for better performance
// Nota: email ya tiene índice único por el decorador @Prop({ unique: true })
UserSchema.index({ deletedAt: 1 });
UserSchema.index({ role: 1 });

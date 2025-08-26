import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { EmployeeRole } from '../enums';

export type EmployeeDocument = Employee & Document;

@Schema({ 
  timestamps: true,
  collection: 'employees'
})
export class Employee {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, enum: EmployeeRole })
  role: EmployeeRole;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ trim: true })
  address?: string;

  @Prop({ required: true, type: Date })
  startDate: Date;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;

  @Prop({ type: Date })
  deletedAt?: Date;
}

export const EmployeeSchema = SchemaFactory.createForClass(Employee);

// Add indexes for better performance
EmployeeSchema.index({ email: 1 });
EmployeeSchema.index({ role: 1 });
EmployeeSchema.index({ deletedAt: 1 });
EmployeeSchema.index({ startDate: 1 });

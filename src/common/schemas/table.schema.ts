import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TableDocument = Table & Document;

/**
 * Mesa física del salón. El salón tiene 10 mesas de 2 personas (M1..M10) y 2
 * mesas grandes de 10 (G1, G2). Las mesas se mueven y se unen, así que NO se
 * modela la posición ni la contigüidad: sólo cuántas hay y de qué tipo.
 *
 * Se guardan en base (y no en config) para que el equipo pueda dar de baja una
 * mesa rota o sumar una nueva sin tocar código.
 */
@Schema({ timestamps: true, collection: 'tables' })
export class Table {
  // Código visible en la agenda: 'M1', 'G1'. Es la clave con la que se asigna.
  @Prop({ required: true, unique: true, trim: true, uppercase: true })
  code: string;

  @Prop({ required: true, enum: ['SMALL', 'LARGE'] })
  kind: 'SMALL' | 'LARGE';

  // Capacidad nominal: 2 para las chicas, 10 para las grandes. Ojo: al unir una
  // mesa a una grande, la grande rinde 9 (ver table-allocation.ts).
  @Prop({ required: true, min: 1 })
  seats: number;

  // Orden de preferencia al asignar. Hace determinista la asignación (siempre
  // se llena M1, M2, ... antes que M10) y ordena la agenda.
  @Prop({ required: true, min: 0, default: 0 })
  order: number;

  @Prop({ type: Boolean, default: true })
  active: boolean;

  @Prop({ type: Date })
  deletedAt?: Date;
}

export const TableSchema = SchemaFactory.createForClass(Table);

TableSchema.index({ active: 1, order: 1 });

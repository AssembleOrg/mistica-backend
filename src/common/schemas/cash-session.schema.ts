import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

export type CashSessionDocument = CashSession & Document;

export type CashSessionStatus = 'OPEN' | 'CLOSED';
export type CashSessionClosureType = 'MANUAL' | 'AUTO'; // Indica si el cierre fue manual o si se cerro de manera automatica a las 00:00hs 

/**
 * Sesión de caja (apertura/cierre).
 *
 * Una caja siempre arranca con un monto inicial en efectivo (`openingCash`).
 * Al cerrarla se registra el `countedClosingCash` que el cajero conta
 * físicamente. El backend calcula `expectedClosingCash` sumando todas las
 * ventas en CASH y restando todos los egresos en CASH del período abierto;
 * la diferencia (`discrepancy`) puede ser positiva (sobra plata) o negativa
 * (falta plata), pero NO bloquea el cierre.
 *
 * En el sistema sólo puede haber UNA sesión OPEN a la vez. Las ventas se
 * bloquean si no hay sesión abierta.
 */
@Schema({
  timestamps: true,
  collection: 'cash_sessions',
})
export class CashSession {
  @Prop({ required: true, enum: ['OPEN', 'CLOSED'], default: 'OPEN' })
  status: CashSessionStatus;

  /**
   * Nombre editable de la sesión. Si está vacío, el front muestra un default
   * con el día y la fecha de apertura (ej. "Miércoles 20/05/26").
   */
  @Prop({ trim: true })
  label?: string;

  @Prop({ type: Date, required: true, default: Date.now })
  openedAt: Date;

  @Prop({ type: Date })
  closedAt?: Date;

  @Prop({ required: true, min: 0 })
  openingCash: number;

  /** Sólo presente al cerrar. Lo declara el cajero al hacer el conteo físico. */
  @Prop({ min: 0 })
  countedClosingCash?: number;

  /**
   * Sólo presente al cerrar. Calculado por el backend:
   *   openingCash + ventas en CASH (amount) - egresos en CASH (amount)
   * Las prepaid en CASH también suman acá.
   */
  @Prop({ min: 0 })
  expectedClosingCash?: number;

  /**
   * Sólo presente al cerrar.
   * = countedClosingCash - expectedClosingCash
   * Negativo => falta plata. Positivo => sobra plata.
   */
  @Prop()
  discrepancy?: number;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  openedByUserId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  closedByUserId?: Types.ObjectId;

  @Prop({ trim: true })
  openingNotes?: string;

  @Prop({ trim: true })
  closingNotes?: string;

  @Prop({ enum: ['MANUAL', 'AUTO'], default: 'MANUAL' })
  closureType: CashSessionClosureType;

  /**
   * Historial de ediciones post-cierre (sólo se permite editar dentro de las
   * 72hs siguientes a `closedAt`). Cada entrada deja un snapshot de los
   * egresos retroactivos cargados — útil para auditoría incluso si después
   * se borra el egreso original. Las entradas se acumulan, nunca se editan.
   */
  @Prop({
    type: [
      {
        editedAt: { type: Date, required: true, default: Date.now },
        editedByUserId: { type: SchemaTypes.ObjectId, ref: 'User' },
        addedEgresses: [
          {
            egressId: { type: SchemaTypes.ObjectId, ref: 'Egress' },
            egressNumber: { type: String },
            concept: { type: String },
            amount: { type: Number },
            paymentMethod: { type: String },
          },
        ],
      },
    ],
    default: [],
  })
  editHistory: Array<{
    editedAt: Date;
    editedByUserId?: Types.ObjectId;
    addedEgresses: Array<{
      egressId: Types.ObjectId;
      egressNumber: string;
      concept: string;
      amount: number;
      paymentMethod: string;
    }>;
  }>;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;
}

export const CashSessionSchema = SchemaFactory.createForClass(CashSession);

CashSessionSchema.index({ status: 1 });
CashSessionSchema.index({ openedAt: -1 });
CashSessionSchema.index({ closedAt: -1 });

// Garantía de "una sola sesión OPEN a la vez": índice único parcial.
// Si llegara a haber concurrencia, MongoDB rechaza la segunda inserción.
CashSessionSchema.index(
  { status: 1 },
  { unique: true, partialFilterExpression: { status: 'OPEN' } },
);

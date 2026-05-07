export enum PaymentMethod {
  CASH = 'CASH',
  CARD = 'CARD',
  TRANSFER = 'TRANSFER',
}

export enum SaleStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

// Tipo de factura AFIP. El código numérico se mapea a `tipoComprobante`:
//   A → 1, B → 6, C → 11. NC asociadas: A → 3, B → 8, C → 13.
export enum InvoiceType {
  A = 'A',
  B = 'B',
  C = 'C',
}

// Condición fiscal del receptor. Mapea a AFIP `condicionIvaReceptor`:
//   RESPONSABLE_INSCRIPTO → 1, EXENTO → 4, CONSUMIDOR_FINAL → 5, MONOTRIBUTISTA → 6.
export enum TaxCondition {
  RESPONSABLE_INSCRIPTO = 'RESPONSABLE_INSCRIPTO',
  MONOTRIBUTISTA = 'MONOTRIBUTISTA',
  EXENTO = 'EXENTO',
  CONSUMIDOR_FINAL = 'CONSUMIDOR_FINAL',
}

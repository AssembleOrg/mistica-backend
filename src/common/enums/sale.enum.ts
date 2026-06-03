export enum PaymentMethod {
  CASH = 'CASH',
  CARD = 'CARD',
  TRANSFER = 'TRANSFER',
}

// Solo para filtros — nunca se guarda en la BD. No modificar PaymentMethod.
export enum PaymentMethodFilter {
  CASH = 'CASH',
  CARD = 'CARD',
  TRANSFER = 'TRANSFER',
  MIXED = 'MIXED',
}

export enum SaleStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  // DEPRECADO — ya no se asigna. El "pago parcial / seña" dejó de ser un estado
  // propio: ahora esas ventas nacen PENDING con `balanceDue` > 0 y siguen el
  // flujo normal (se autocompletan al cierre de caja descontando el saldo no
  // cobrado). El valor se conserva sólo para lecturas históricas previas a la
  // migración (ver scripts/migrate-sena-to-pending.mongo.js).
  PARTIAL = 'PARTIAL',
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

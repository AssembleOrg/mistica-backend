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
  // Pago parcial (seña sobre la venta). El total queda en `total`, lo ya
  // cobrado en la suma de `payments[].amount`, y la diferencia en `balanceDue`.
  // Las ventas PARTIAL NO se confirman automáticamente al cierre de caja:
  // se quedan así hasta que un usuario destilde el toggle (→ COMPLETED).
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

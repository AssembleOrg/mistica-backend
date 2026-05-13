// Distingue productos normales de productos especiales que requieren manejo
// distinto en el flujo de venta.
//   STANDARD = producto físico con stock
//   SERVICE  = item sin stock (servicio prestado: corte de pelo, consultoría, etc.)
//   PREPAID  = línea que crea una seña (prepaid) para el cliente. No afecta stock
//              y el monto se ingresa por línea desde el modal de venta.
export enum ProductKind {
  STANDARD = 'STANDARD',
  SERVICE = 'SERVICE',
  PREPAID = 'PREPAID',
}

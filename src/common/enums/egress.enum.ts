export enum EgressType {
  WITHDRAWAL = 'WITHDRAWAL',           // Retiro de dinero
  EXPENSE = 'EXPENSE',                 // Gasto operativo
  REFUND = 'REFUND',                   // Devolución
  TRANSFER = 'TRANSFER',               // Transferencia
  OTHER = 'OTHER'                      // Otros
}

export enum EgressStatus {
  PENDING = 'PENDING',                 // Pendiente
  COMPLETED = 'COMPLETED',             // Completado
  CANCELLED = 'CANCELLED'              // Cancelado
}
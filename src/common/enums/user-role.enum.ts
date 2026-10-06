export enum UserRole {
  ADMIN = 'admin',
  /**
   * Encargado/a (la compu del local, por ejemplo): hace todo lo operativo
   * del admin en las vistas que tiene (cobrar, reservar, editar, cargar) pero
   * no ve balances ni cierres, ni borra registros con plata (egresos, ventas,
   * pagos), ni gestiona cuentas.
   */
  MANAGER = 'manager',
  USER = 'user',
}

/** ¿Hace la gestión operativa (admin o encargado)? */
export function canManage(role?: string | null): boolean {
  return role === UserRole.ADMIN || role === UserRole.MANAGER;
} 
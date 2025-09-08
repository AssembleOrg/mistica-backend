/**
 * Construye filtros de fecha para consultas MongoDB
 * @param from Fecha de inicio (ISO string)
 * @param to Fecha de fin (ISO string)  
 * @param fieldName Nombre del campo de fecha (default: 'createdAt')
 * @returns Objeto con filtros de fecha para MongoDB
 */
export function buildDateFilter(from?: string, to?: string, fieldName: string = 'createdAt'): Record<string, any> {
  const dateFilter: Record<string, any> = {};

  if (from || to) {
    dateFilter[fieldName] = {};
    
    if (from) {
      // Si solo se proporciona fecha (YYYY-MM-DD), agregar hora de inicio del día
      const fromDate = from.includes('T') ? new Date(from) : new Date(`${from}T00:00:00.000Z`);
      dateFilter[fieldName].$gte = fromDate;
    }
    
    if (to) {
      // Si solo se proporciona fecha (YYYY-MM-DD), agregar hora de fin del día
      const toDate = to.includes('T') ? new Date(to) : new Date(`${to}T23:59:59.999Z`);
      dateFilter[fieldName].$lte = toDate;
    }
  }

  return dateFilter;
}
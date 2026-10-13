import { DateTime } from 'luxon';
import { envConfig } from '../../config/env.config';

/**
 * Inicio (00:00) o fin (23:59:59.999) de un día `YYYY-MM-DD` en la zona del
 * negocio. El servidor corre en UTC: armar el corte con la hora del servidor
 * dejaba afuera del día todo lo cargado después de las 21:00 de Argentina
 * (una caja reabierta a la noche caía en el día siguiente, y en el cierre de
 * mes, en el mes siguiente).
 */
export function businessDayBound(date: string, bound: 'start' | 'end'): Date {
  const day = DateTime.fromISO(date, { zone: envConfig.timezone });
  return (bound === 'start' ? day.startOf('day') : day.endOf('day')).toJSDate();
}

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
      const fromDate = from.includes('T') ? new Date(from) : businessDayBound(from, 'start');
      dateFilter[fieldName].$gte = fromDate;
    }
    
    if (to) {
      // Si solo se proporciona fecha (YYYY-MM-DD), agregar hora de fin del día
      const toDate = to.includes('T') ? new Date(to) : businessDayBound(to, 'end');
      dateFilter[fieldName].$lte = toDate;
    }
  }

  return dateFilter;
}

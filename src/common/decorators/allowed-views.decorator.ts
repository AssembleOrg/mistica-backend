import { SetMetadata } from '@nestjs/common';

/**
 * Vista (o sub-vista) del panel necesaria para usar un endpoint. Mantiene la
 * misma semántica que el frontend: `reservas` habilita sus pestañas y una
 * cuenta sin whitelist conserva el acceso estándar no administrativo.
 */
export const ALLOWED_VIEWS_KEY = 'allowedViews';
export const AllowedViews = (...views: string[]) =>
  SetMetadata(ALLOWED_VIEWS_KEY, views);

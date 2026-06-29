import { Global, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

/**
 * Global para que cualquier módulo (reservas, leads, filtro de errores) pueda
 * inyectar NotificationsService sin reimportar.
 */
@Global()
@Module({
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}

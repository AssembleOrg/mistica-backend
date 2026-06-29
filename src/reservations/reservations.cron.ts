import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReservationsService } from './reservations.service';

/**
 * Libera cupo de los holds vencidos. Corre cada minuto: el hold dura 10 min, así
 * que el cupo se libera a más tardar ~1 min después del vencimiento.
 */
@Injectable()
export class ReservationsCron {
  private readonly logger = new Logger(ReservationsCron.name);
  private running = false;

  constructor(private readonly reservationsService: ReservationsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async expireHolds(): Promise<void> {
    if (this.running) return; // evita solapamiento si una corrida se atrasa
    this.running = true;
    try {
      await this.reservationsService.expireHolds();
    } catch (err) {
      this.logger.error(`expireHolds falló: ${String(err)}`);
    } finally {
      this.running = false;
    }
  }

  // Registra las ventas de reservas que quedaron pendientes por caja cerrada,
  // una vez que hay caja abierta. Cada 5 minutos alcanza.
  @Cron(CronExpression.EVERY_5_MINUTES)
  async processPendingSales(): Promise<void> {
    try {
      await this.reservationsService.processPendingReservationSales();
    } catch (err) {
      this.logger.error(`processPendingReservationSales falló: ${String(err)}`);
    }
  }

  // Recordatorios de turnos próximos (~24 h antes). Cada hora.
  @Cron(CronExpression.EVERY_HOUR)
  async sendReminders(): Promise<void> {
    try {
      await this.reservationsService.sendDueReminders();
    } catch (err) {
      this.logger.error(`sendDueReminders falló: ${String(err)}`);
    }
  }
}

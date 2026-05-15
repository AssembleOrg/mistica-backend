import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CashboxService } from './cashbox.service';

@Injectable()
export class CashboxCronService {
    private readonly logger = new Logger(CashboxCronService.name);

    constructor(private readonly cashboxService: CashboxService) { }

    /**
     * Se ejecuta a las 00:00 todos los dias en hora de Argentina.
     */
    @Cron('0 0 * * *', {
        name: 'autoCloseCashSession',
        timeZone: 'America/Argentina/Buenos_Aires',
    })
    async handleAutoCloseSession() {
        this.logger.log('Ejecutando revisión de caja a la medianoche (00:00)...');

        try {
            await this.cashboxService.autoClose();
            this.logger.log('Cierre automático de caja exitoso.');
        } catch (error) {
            this.logger.error('Error al intentar cerrar la caja automáticamente', error);
        }
    }
}

import { Injectable, Logger } from '@nestjs/common';
import { envConfig } from '../config/env.config';

/**
 * Envía mensajes de WhatsApp a través del control server del bot
 * (`mistica-whatsapp-bot`), que expone POST /notify { phone, message }.
 *
 * Best-effort: nunca lanza. Un fallo de notificación no debe tumbar el flujo
 * que la dispara (confirmación de reserva, alta de lead, etc.).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  private get configured(): boolean {
    return Boolean(envConfig.botControl.url && envConfig.botControl.secret);
  }

  /** Manda un WhatsApp a un teléfono. Devuelve true si se entregó al bot. */
  async notify(phone: string | undefined, message: string): Promise<boolean> {
    if (!this.configured) {
      this.logger.debug('Bot control no configurado: se omite la notificación');
      return false;
    }
    const to = (phone || '').replace(/[^\d]/g, '');
    if (!to) return false;
    try {
      const res = await fetch(`${envConfig.botControl.url.replace(/\/$/, '')}/notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bot-Secret': envConfig.botControl.secret,
        },
        body: JSON.stringify({ phone: to, message }),
      });
      if (!res.ok) {
        this.logger.warn(`notify ${to} → HTTP ${res.status}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.warn(`notify ${to} falló: ${String(err)}`);
      return false;
    }
  }

  /** Aviso interno al WhatsApp del equipo (si está configurado). */
  async notifyTeam(message: string): Promise<boolean> {
    if (!envConfig.teamWhatsapp) return false;
    return this.notify(envConfig.teamWhatsapp, message);
  }
}

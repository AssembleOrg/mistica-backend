import { Injectable, Logger } from '@nestjs/common';
import { envConfig } from '../config/env.config';

/**
 * Avisa al bot que un chat pasa a manos de una persona (o vuelve al bot).
 *
 * El bot podría descubrirlo consultando el backend en cada mensaje, pero
 * entonces la reactivación tardaría hasta que el cliente vuelva a escribir. Con
 * este empujón el cambio es inmediato: el backend le dice al bot que despause y
 * el próximo mensaje ya lo atiende la IA.
 *
 * Usa el mismo control server y el mismo secreto compartido que las
 * notificaciones. Es best-effort: si el bot no responde, el bot igual va a
 * consultar el estado por su cuenta (el backend sigue siendo la autoridad).
 */
@Injectable()
export class BotHandoffService {
  private readonly logger = new Logger(BotHandoffService.name);

  private get enabled(): boolean {
    return Boolean(envConfig.botControl.url && envConfig.botControl.secret);
  }

  async setPaused(phone: string, paused: boolean): Promise<boolean> {
    if (!this.enabled) {
      this.logger.debug('Sin BOT_CONTROL_URL/SECRET: no aviso al bot');
      return false;
    }
    const base = envConfig.botControl.url.replace(/\/$/, '');
    try {
      const res = await fetch(`${base}/handoff`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bot-Secret': envConfig.botControl.secret,
        },
        body: JSON.stringify({ phone, paused }),
      });
      if (!res.ok) {
        this.logger.warn(`handoff ***${phone.slice(-4)} → HTTP ${res.status}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.warn(
        `No pude avisarle al bot del handoff ***${phone.slice(-4)}: ${String(err)}`,
      );
      return false;
    }
  }
}

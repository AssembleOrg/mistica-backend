import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { NotificationsService } from '../../notifications/notifications.service';

/**
 * Filtro global de errores. Loguea de forma estructurada y, ante errores 5xx
 * (fallas reales del servidor), avisa al WhatsApp del equipo. Alternativa ligera
 * a Sentry sin vendor: reutiliza el bot para alertar. Para algo más robusto, se
 * puede apuntar a GlitchTip (compatible con Sentry, self-host) o Sentry free.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');
  // Evita spamear: máximo 1 alerta por firma de error cada 5 min.
  private readonly lastAlert = new Map<string, number>();

  constructor(private readonly notifications: NotificationsService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const payload =
      exception instanceof HttpException
        ? exception.getResponse()
        : { statusCode: status, message: 'Error interno del servidor' };

    if (status >= 500) {
      const msg = exception instanceof Error ? exception.message : String(exception);
      this.logger.error(
        `${req.method} ${req.url} → ${status}: ${msg}`,
        exception instanceof Error ? exception.stack : undefined,
      );
      void this.maybeAlert(`${req.method} ${req.url}`, msg);
    } else {
      this.logger.warn(`${req.method} ${req.url} → ${status}`);
    }

    res.status(status).json(
      typeof payload === 'string' ? { statusCode: status, message: payload } : payload,
    );
  }

  private async maybeAlert(route: string, message: string): Promise<void> {
    const key = `${route}:${message}`.slice(0, 120);
    const now = Date.now();
    const last = this.lastAlert.get(key) ?? 0;
    if (now - last < 300_000) return; // throttle 5 min por firma
    this.lastAlert.set(key, now);
    await this.notifications.notifyTeam(
      `⚠️ Error en el backend\n${route}\n${message.slice(0, 300)}`,
    );
  }
}

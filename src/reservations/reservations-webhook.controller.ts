import { Body, Controller, Headers, Logger, Post, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../common/decorators';
import { MercadopagoService } from '../mercadopago/mercadopago.service';
import { ReservationsService } from './reservations.service';

/** Cuerpo (parcial) de una notificación de MercadoPago. */
interface MpWebhookBody {
  type?: string;
  topic?: string;
  action?: string;
  data?: { id?: string | number };
}

/**
 * Webhook de MercadoPago. Público. Valida firma (si hay secreto), extrae el id
 * del pago y delega en el service (idempotente). Siempre responde 200 para que
 * MP no reintente eventos ya resueltos o inválidos.
 */
@ApiExcludeController()
@Controller('webhooks/mercadopago')
export class ReservationsWebhookController {
  private readonly logger = new Logger(ReservationsWebhookController.name);

  constructor(
    private readonly reservationsService: ReservationsService,
    private readonly mercadopago: MercadopagoService,
  ) {}

  @Post()
  @Public()
  async handle(
    @Headers('x-signature') xSignature: string | undefined,
    @Headers('x-request-id') xRequestId: string | undefined,
    @Query() query: Record<string, string | undefined>,
    @Body() body: MpWebhookBody,
  ): Promise<{ received: boolean }> {
    const type = body?.type ?? body?.topic ?? query?.type ?? query?.topic;
    const rawId = body?.data?.id ?? query?.['data.id'] ?? query?.id;
    const dataId = rawId != null ? String(rawId) : undefined;

    // Sólo nos interesan notificaciones de pago.
    if (type !== 'payment') {
      return { received: true };
    }

    if (!this.mercadopago.validateSignature(xSignature, xRequestId, dataId)) {
      this.logger.warn(
        `Webhook con firma inválida (data.id=${dataId ?? ''}). Ignorado.`,
      );
      return { received: true };
    }

    if (!dataId) return { received: true };

    try {
      await this.reservationsService.confirmFromPayment(dataId);
    } catch (err) {
      // Logueamos pero devolvemos 200: el reintento de MP no arregla un error
      // de nuestro lado y dispararía loops. La conciliación se hace aparte.
      this.logger.error(`Error procesando pago ${dataId}: ${String(err)}`);
    }
    return { received: true };
  }
}

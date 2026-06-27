import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { DateTime } from 'luxon';
import { envConfig } from '../config/env.config';

const MP_API = 'https://api.mercadopago.com';

export interface CreatePreferenceInput {
  reservationId: string;
  title: string;
  quantity: number;
  unitPrice: number;
  // Vencimiento del hold: la preference expira acá (MP rechaza pagos posteriores).
  expiresAt: Date;
  payer?: { name?: string; email?: string };
}

export interface CreatePreferenceResult {
  id: string;
  initPoint: string;
  sandboxInitPoint: string;
}

export interface MpPayment {
  id: number;
  status: string; // approved | rejected | cancelled | in_process | refunded ...
  status_detail?: string;
  external_reference?: string;
  transaction_amount?: number;
  order?: { id?: string };
  [k: string]: unknown;
}

/**
 * Cliente liviano de MercadoPago vía `fetch` nativo (Node 20+). Sin SDK ni
 * axios para no sumar dependencias. Sólo lo que necesita el flujo de reservas:
 * crear preference de Checkout Pro, leer un pago, reembolsar y validar la firma
 * del webhook.
 */
@Injectable()
export class MercadopagoService {
  private readonly logger = new Logger(MercadopagoService.name);

  private get token(): string {
    const t = envConfig.mercadopago.accessToken;
    if (!t) {
      throw new Error('MP_ACCESS_TOKEN no configurado');
    }
    return t;
  }

  /** Crea una preference de Checkout Pro y devuelve el init_point (redirect). */
  async createPreference(
    input: CreatePreferenceInput,
  ): Promise<CreatePreferenceResult> {
    const { frontend, backend } = envConfig.urls;
    const expiration = DateTime.fromJSDate(input.expiresAt)
      .setZone(envConfig.timezone)
      .toISO();

    const body = {
      items: [
        {
          id: input.reservationId,
          title: input.title,
          quantity: input.quantity,
          unit_price: input.unitPrice,
          currency_id: 'ARS',
        },
      ],
      external_reference: input.reservationId,
      // Hold corto ⇒ sólo métodos instantáneos. Excluimos ticket (Rapipago/
      // Pago Fácil) y atm: tardan horas y el hold ya habría expirado.
      payment_methods: {
        excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }],
        installments: 1,
      },
      // binary_mode: sólo approved/rejected, sin "in_process" colgado que
      // dejaría la reserva en limbo.
      binary_mode: true,
      expires: true,
      expiration_date_to: expiration,
      back_urls: {
        success: `${frontend}/reservas/estado?ref=${input.reservationId}`,
        failure: `${frontend}/reservas/estado?ref=${input.reservationId}`,
        pending: `${frontend}/reservas/estado?ref=${input.reservationId}`,
      },
      auto_return: 'approved',
      notification_url: `${backend}/api/webhooks/mercadopago`,
      payer: input.payer
        ? { name: input.payer.name, email: input.payer.email }
        : undefined,
    };

    const res = await fetch(`${MP_API}/checkout/preferences`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`createPreference falló (${res.status}): ${text}`);
      throw new Error(`MercadoPago createPreference ${res.status}`);
    }

    const data = (await res.json()) as {
      id: string;
      init_point: string;
      sandbox_init_point: string;
    };
    return {
      id: data.id,
      initPoint: data.init_point,
      sandboxInitPoint: data.sandbox_init_point,
    };
  }

  /** Trae un pago por id. Devuelve null si no existe / error 404. */
  async getPayment(paymentId: string): Promise<MpPayment | null> {
    const res = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`getPayment falló (${res.status}): ${text}`);
      throw new Error(`MercadoPago getPayment ${res.status}`);
    }
    return (await res.json()) as MpPayment;
  }

  /** Reembolso total de un pago (cuando el cupo ya no está disponible). */
  async refundPayment(paymentId: string): Promise<boolean> {
    const res = await fetch(`${MP_API}/v1/payments/${paymentId}/refunds`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        // Idempotencia del lado de MP: mismo pago ⇒ mismo refund.
        'X-Idempotency-Key': `refund-${paymentId}`,
      },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`refundPayment falló (${res.status}): ${text}`);
      return false;
    }
    return true;
  }

  /**
   * Valida la firma del webhook (header `x-signature` con `ts` y `v1`).
   * Manifest: `id:<dataId>;request-id:<x-request-id>;ts:<ts>;` ⇒ HMAC-SHA256
   * con el secreto. Si no hay secreto configurado, no valida (dev).
   */
  validateSignature(
    xSignature: string | undefined,
    xRequestId: string | undefined,
    dataId: string | undefined,
  ): boolean {
    const secret = envConfig.mercadopago.webhookSecret;
    if (!secret) return true; // sin secreto ⇒ no se valida (dev)
    if (!xSignature || !dataId) return false;

    const parts = Object.fromEntries(
      xSignature.split(',').map((kv) => {
        const [k, v] = kv.split('=');
        return [k?.trim(), v?.trim()];
      }),
    );
    const ts = parts['ts'];
    const v1 = parts['v1'];
    if (!ts || !v1) return false;

    const manifest = `id:${dataId.toLowerCase()};request-id:${xRequestId ?? ''};ts:${ts};`;
    const computed = createHmac('sha256', secret)
      .update(manifest)
      .digest('hex');

    try {
      const a = Buffer.from(computed, 'hex');
      const b = Buffer.from(v1, 'hex');
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }
}

import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { THROTTLE_KEY, ThrottleOptions } from '../decorators';

/**
 * Rate limit en memoria por IP + ruta, ventana deslizante. Dependency-free
 * (sin Redis ni @nestjs/throttler): un solo proceso (Railway) ⇒ alcanza un Map.
 *
 * Protege los endpoints PÚBLICOS de abuso directo (spam de leads, intentos de
 * acaparar cupo con holds, fuerza bruta de códigos). Se aplica por ruta con
 * `@Throttle(limit, windowSec)`. Sin ese decorador, no hace nada.
 *
 * Nota: en PaaS la IP real llega en `x-forwarded-for`; tomamos el primer hop.
 */
@Injectable()
export class SimpleThrottleGuard implements CanActivate {
  private readonly hits = new Map<string, number[]>();
  private lastGc = 0;

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const opts = this.reflector.getAllAndOverride<ThrottleOptions | undefined>(
      THROTTLE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!opts) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const ip = this.clientIp(req);
    const routeKey = req.route?.path ?? req.path;
    const key = `${req.method}:${routeKey}:${ip}`;

    const now = Date.now();
    const windowMs = opts.windowSec * 1000;
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < windowMs);

    if (recent.length >= opts.limit) {
      throw new HttpException(
        'Demasiadas solicitudes. Probá de nuevo en un momento.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    recent.push(now);
    this.hits.set(key, recent);
    this.maybeGc(now);
    return true;
  }

  private clientIp(req: Request): string {
    const xff = (req.headers['x-forwarded-for'] as string | undefined) ?? '';
    const first = xff.split(',')[0]?.trim();
    return first || req.ip || 'unknown';
  }

  /** Limpieza ocasional para que el Map no crezca sin techo. */
  private maybeGc(now: number): void {
    if (now - this.lastGc < 300_000 && this.hits.size < 10_000) return;
    this.lastGc = now;
    for (const [k, arr] of this.hits) {
      const keep = arr.filter((t) => now - t < 3_600_000);
      if (keep.length) this.hits.set(k, keep);
      else this.hits.delete(k);
    }
  }
}

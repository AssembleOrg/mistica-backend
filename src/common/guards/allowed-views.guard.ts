import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALLOWED_VIEWS_KEY } from '../decorators/allowed-views.decorator';

@Injectable()
export class AllowedViewsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      ALLOWED_VIEWS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) return true;

    const user = context.switchToHttp().getRequest().user as
      | { role?: string; allowedViews?: string[] }
      | undefined;
    if (user?.role === 'admin') return true;

    // Whitelist ausente/vacía = acceso estándar para cuentas comunes, igual
    // que en el panel. Una lista no vacía restringe efectivamente el API.
    const granted = user?.allowedViews ?? [];
    if (!granted.length) return true;
    if (required.some((view) => this.hasView(granted, view))) return true;

    throw new ForbiddenException('Tu cuenta no tiene acceso a esta vista.');
  }

  private hasView(granted: string[], required: string): boolean {
    if (granted.includes(required)) return true;
    const parent = required.split(':')[0];
    // `reservas` da acceso a `reservas:piezas`.
    if (required.includes(':') && granted.includes(parent)) return true;
    // Cualquier sub-vista habilita la vista contenedora.
    return !required.includes(':') && granted.some((v) => v.startsWith(`${required}:`));
  }
}

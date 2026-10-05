import { Injectable, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ALLOW_SSE_TOKEN_KEY, IS_PUBLIC_KEY } from '../decorators';
import { SSE_TOKEN_STRATEGY } from '../../auth/sse-token';

/**
 * Cookie primero; si no hay sesión válida, el token de stream de `?token=`.
 * Sólo para endpoints con `@AllowSseToken()` (los streams SSE).
 */
const CookieOrSseTokenGuard = AuthGuard(['jwt', SSE_TOKEN_STRATEGY]);

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly cookieOrSseToken = new CookieOrSseTokenGuard();

  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const allowSseToken = this.reflector.getAllAndOverride<boolean>(
      ALLOW_SSE_TOKEN_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (allowSseToken) {
      return this.cookieOrSseToken.canActivate(context);
    }

    return super.canActivate(context);
  }
}

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../common/schemas';
import {
  SSE_TOKEN_AUDIENCE,
  SSE_TOKEN_QUERY_PARAM,
  SSE_TOKEN_STRATEGY,
  SSE_TOKEN_TYPE,
} from '../sse-token';
import { loadSessionUser } from './session-user';

/**
 * Autentica un stream SSE con el token corto de `?token=`. Sólo la usan los
 * endpoints con `@AllowSseToken()` (vía JwtAuthGuard). El token se valida al
 * conectar: vencido después, el stream sigue abierto hasta que se corte.
 */
@Injectable()
export class SseTokenStrategy extends PassportStrategy(
  Strategy,
  SSE_TOKEN_STRATEGY,
) {
  constructor(
    configService: ConfigService,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {
    const jwtSecret = configService.get<string>('JWT_SECRET');
    if (!jwtSecret) {
      throw new Error('JWT_SECRET is not defined');
    }

    super({
      jwtFromRequest: ExtractJwt.fromUrlQueryParameter(SSE_TOKEN_QUERY_PARAM),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
      audience: SSE_TOKEN_AUDIENCE,
      algorithms: ['HS256'],
    });
  }

  async validate(payload: { sub?: string; typ?: string }) {
    if (payload?.typ !== SSE_TOKEN_TYPE) {
      throw new UnauthorizedException('Token de stream inválido');
    }
    return loadSessionUser(this.userModel, payload.sub);
  }
}

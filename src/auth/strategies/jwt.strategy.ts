import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, JwtFromRequestFunction } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { Request } from 'express';
import { User, UserDocument } from '../../common/schemas';
import { isSseTokenPayload } from '../sse-token';
import { loadSessionUser } from './session-user';

export const ACCESS_TOKEN_COOKIE = 'access_token';

const fromCookie: JwtFromRequestFunction = (req: Request) => {
  return req?.cookies?.[ACCESS_TOKEN_COOKIE] ?? null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {
    const jwtSecret = configService.get<string>('JWT_SECRET');
    if (!jwtSecret) {
      throw new Error('JWT_SECRET is not defined');
    }

    super({
      jwtFromRequest: fromCookie,
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  /**
   * Rol y vistas se leen de la base (ver `loadSessionUser`). Un token de stream
   * SSE (`typ: 'sse'`) nunca vale como sesión aunque llegue en la cookie.
   */
  async validate(payload: {
    sub?: string;
    email?: string;
    typ?: string;
    aud?: unknown;
  }) {
    if (isSseTokenPayload(payload)) {
      throw new UnauthorizedException('Sesión inválida');
    }
    return loadSessionUser(this.userModel, payload?.sub);
  }
}

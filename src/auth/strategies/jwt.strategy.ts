import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, JwtFromRequestFunction } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { Request } from 'express';
import { User, UserDocument } from '../../common/schemas';

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
   * El rol y las vistas salen de la base en cada request, no del token: así un
   * cambio de permisos (o el borrado de la cuenta) aplica al instante y no
   * queda vivo hasta que venza la sesión.
   */
  async validate(payload: { sub?: string; email?: string }) {
    if (!payload?.sub || !Types.ObjectId.isValid(payload.sub)) {
      throw new UnauthorizedException('Sesión inválida');
    }
    const user = await this.userModel
      .findOne({ _id: payload.sub, deletedAt: { $exists: false } })
      .select('email role allowedViews')
      .lean();
    if (!user) throw new UnauthorizedException('Sesión inválida');

    return {
      id: String(user._id),
      email: user.email,
      role: user.role,
      allowedViews: user.allowedViews ?? [],
    };
  }
}

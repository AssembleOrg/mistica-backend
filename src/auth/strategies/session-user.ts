import { UnauthorizedException } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { UserDocument } from '../../common/schemas';

export interface SessionUser {
  id: string;
  email: string;
  role: string;
  allowedViews: string[];
}

/**
 * El rol y las vistas salen de la base en cada request, no del token: así un
 * cambio de permisos (o el borrado de la cuenta) aplica al instante y no
 * queda vivo hasta que venza la sesión.
 */
export async function loadSessionUser(
  userModel: Model<UserDocument>,
  sub: unknown,
): Promise<SessionUser> {
  if (typeof sub !== 'string' || !Types.ObjectId.isValid(sub)) {
    throw new UnauthorizedException('Sesión inválida');
  }
  const user = await userModel
    .findOne({ _id: sub, deletedAt: { $exists: false } })
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

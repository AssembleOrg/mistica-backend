import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const AUDITORY_KEY = 'auditory';
export interface AuditoryOptions {
  entity: string;
  action: string;
}

export const Auditory = (options: AuditoryOptions) => SetMetadata(AUDITORY_KEY, options);

// Rate limit por IP para endpoints públicos (anti-spam / anti-DoS). Lo lee
// SimpleThrottleGuard. `limit` solicitudes cada `windowSec` segundos.
export const THROTTLE_KEY = 'throttle';
export interface ThrottleOptions {
  limit: number;
  windowSec: number;
}
export const Throttle = (limit: number, windowSec: number) => {
  const opts: ThrottleOptions = { limit, windowSec };
  return SetMetadata(THROTTLE_KEY, opts);
};

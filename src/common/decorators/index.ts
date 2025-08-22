import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const AUDITORY_KEY = 'auditory';
export interface AuditoryOptions {
  entity: string;
  action: string;
}

export const Auditory = (options: AuditoryOptions) => SetMetadata(AUDITORY_KEY, options); 
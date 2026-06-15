import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditLogSchema } from '../common/schemas/audit-log.schema';
import { AuditInterceptor } from '../common/interceptors/audit.interceptor';
import { AuditController } from './audit.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: 'AuditLog', schema: AuditLogSchema }])],
  controllers: [AuditController],
  providers: [
    AuditInterceptor,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AuditModule {}

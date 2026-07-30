import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EgressesController } from './egresses.controller';
import { EgressesService } from './egresses.service';
import { Egress, EgressSchema, AuditLog, AuditLogSchema } from '../common/schemas';
import { SettingsModule } from '../settings/settings.module';
import { CashboxModule } from '../cashbox/cashbox.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Egress.name, schema: EgressSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
    ]),
    SettingsModule,
    CashboxModule,
  ],
  controllers: [EgressesController],
  providers: [EgressesService],
  exports: [EgressesService],
})
export class EgressesModule {}

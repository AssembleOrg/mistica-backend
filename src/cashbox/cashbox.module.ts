import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CashboxController } from './cashbox.controller';
import { CashboxService } from './cashbox.service';
import {
  CashSession,
  CashSessionSchema,
  Sale,
  SaleSchema,
  Prepaid,
  PrepaidSchema,
  Egress,
  EgressSchema,
} from '../common/schemas';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CashSession.name, schema: CashSessionSchema },
      { name: Sale.name, schema: SaleSchema },
      { name: Prepaid.name, schema: PrepaidSchema },
      { name: Egress.name, schema: EgressSchema },
    ]),
  ],
  controllers: [CashboxController],
  providers: [CashboxService],
  exports: [CashboxService],
})
export class CashboxModule {}

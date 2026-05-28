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
  CashIncome,
  CashIncomeSchema,
} from '../common/schemas';
import { CashboxCronService } from './cashbox.cron';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CashSession.name, schema: CashSessionSchema },
      { name: Sale.name, schema: SaleSchema },
      { name: Prepaid.name, schema: PrepaidSchema },
      { name: Egress.name, schema: EgressSchema },
      { name: CashIncome.name, schema: CashIncomeSchema },
    ]),
  ],
  controllers: [CashboxController],
  providers: [CashboxService, CashboxCronService],
  exports: [CashboxService],
})
export class CashboxModule { }

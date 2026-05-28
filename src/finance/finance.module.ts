import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import {
  CashIncome,
  CashIncomeSchema,
  CashSession,
  CashSessionSchema,
  Egress,
  EgressSchema,
  Prepaid,
  PrepaidSchema,
  Sale,
  SaleSchema,
} from '../common/schemas';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Sale.name, schema: SaleSchema },
      { name: Prepaid.name, schema: PrepaidSchema },
      { name: Egress.name, schema: EgressSchema },
      { name: CashIncome.name, schema: CashIncomeSchema },
      { name: CashSession.name, schema: CashSessionSchema },
    ]),
  ],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}

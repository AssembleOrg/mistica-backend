import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { Sale, SaleSchema } from '../common/schemas/sale.schema';
import { Product, ProductSchema } from '../common/schemas/product.schema';
import { Client, ClientSchema } from '../common/schemas/client.schema';
import { Prepaid, PrepaidSchema } from '../common/schemas/prepaid.schema';
import { PrepaidsModule } from '../prepaids/prepaids.module';
import { CashboxModule } from '../cashbox/cashbox.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Sale.name, schema: SaleSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Client.name, schema: ClientSchema },
      { name: Prepaid.name, schema: PrepaidSchema },
    ]),
    PrepaidsModule,
    CashboxModule,
  ],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { Sale, SaleSchema } from '../common/schemas/sale.schema';
import { Product, ProductSchema } from '../common/schemas/product.schema';
import { Client, ClientSchema } from '../common/schemas/client.schema';
import { Prepaid, PrepaidSchema } from '../common/schemas/prepaid.schema';
import { Reservation, ReservationSchema } from '../common/schemas/reservation.schema';
import { PrepaidsModule } from '../prepaids/prepaids.module';
import { CashboxModule } from '../cashbox/cashbox.module';
import { StudentsModule } from '../students/students.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Sale.name, schema: SaleSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Client.name, schema: ClientSchema },
      { name: Prepaid.name, schema: PrepaidSchema },
      { name: Reservation.name, schema: ReservationSchema },
    ]),
    PrepaidsModule,
    CashboxModule,
    StudentsModule,
  ],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}

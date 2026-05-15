import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { Client, ClientSchema } from '../common/schemas/client.schema';
import { Prepaid, PrepaidSchema } from '../common/schemas/prepaid.schema';

import { Sale, SaleSchema } from '../common/schemas/sale.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Client.name, schema: ClientSchema },
      { name: Prepaid.name, schema: PrepaidSchema },
      { name: Sale.name, schema: SaleSchema },
    ]),
  ],
  controllers: [ClientsController],
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PrepaidsController } from './prepaids.controller';
import { PrepaidsService } from './prepaids.service';
import { Prepaid, PrepaidSchema } from '../common/schemas/prepaid.schema';
import { Client, ClientSchema } from '../common/schemas/client.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Prepaid.name, schema: PrepaidSchema },
      { name: Client.name, schema: ClientSchema },
    ]),
  ],
  controllers: [PrepaidsController],
  providers: [PrepaidsService],
  exports: [PrepaidsService],
})
export class PrepaidsModule {}

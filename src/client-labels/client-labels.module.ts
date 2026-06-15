import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ClientLabelsController } from './client-labels.controller';
import { ClientLabelsService } from './client-labels.service';
import { ClientLabel, ClientLabelSchema } from '../common/schemas/client-label.schema';
import { Client, ClientSchema } from '../common/schemas/client.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ClientLabel.name, schema: ClientLabelSchema },
      { name: Client.name, schema: ClientSchema },
    ]),
  ],
  controllers: [ClientLabelsController],
  providers: [ClientLabelsService],
})
export class ClientLabelsModule {}

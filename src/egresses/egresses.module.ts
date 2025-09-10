import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EgressesController } from './egresses.controller';
import { EgressesService } from './egresses.service';
import { Egress, EgressSchema } from '../common/schemas';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Egress.name, schema: EgressSchema },
    ]),
  ],
  controllers: [EgressesController],
  providers: [EgressesService],
  exports: [EgressesService],
})
export class EgressesModule {}
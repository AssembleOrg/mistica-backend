import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ClosedDate,
  ClosedDateSchema,
} from '../common/schemas/closed-date.schema';
import { ClosedDatesController } from './closed-dates.controller';
import { ClosedDatesService } from './closed-dates.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ClosedDate.name, schema: ClosedDateSchema },
    ]),
  ],
  controllers: [ClosedDatesController],
  providers: [ClosedDatesService],
  exports: [ClosedDatesService],
})
export class ClosedDatesModule {}

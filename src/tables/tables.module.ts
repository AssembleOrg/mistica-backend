import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  DayOccupancy,
  DayOccupancySchema,
  ExperienceSession,
  ExperienceSessionSchema,
  RecurringBlock,
  RecurringBlockSchema,
  Reservation,
  ReservationSchema,
  ShiftTemplate,
  ShiftTemplateSchema,
  Table,
  TableSchema,
} from '../common/schemas';
import { TablesController } from './tables.controller';
import { TablesService } from './tables.service';
import { ShiftsService } from './shifts.service';
import { RecurringBlocksService } from './recurring-blocks.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Table.name, schema: TableSchema },
      { name: DayOccupancy.name, schema: DayOccupancySchema },
      { name: Reservation.name, schema: ReservationSchema },
      { name: ShiftTemplate.name, schema: ShiftTemplateSchema },
      { name: ExperienceSession.name, schema: ExperienceSessionSchema },
      { name: RecurringBlock.name, schema: RecurringBlockSchema },
    ]),
  ],
  controllers: [TablesController],
  providers: [TablesService, ShiftsService, RecurringBlocksService],
  exports: [TablesService, ShiftsService, RecurringBlocksService],
})
export class TablesModule {}

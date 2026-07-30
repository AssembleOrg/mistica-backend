import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  DayOccupancy,
  DayOccupancySchema,
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

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Table.name, schema: TableSchema },
      { name: DayOccupancy.name, schema: DayOccupancySchema },
      { name: Reservation.name, schema: ReservationSchema },
      { name: ShiftTemplate.name, schema: ShiftTemplateSchema },
    ]),
  ],
  controllers: [TablesController],
  providers: [TablesService, ShiftsService],
  exports: [TablesService, ShiftsService],
})
export class TablesModule {}

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
import { BusinessHoursService } from './business-hours.service';
import {
  AppSetting,
  AppSettingSchema,
} from '../common/schemas/app-setting.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Table.name, schema: TableSchema },
      { name: DayOccupancy.name, schema: DayOccupancySchema },
      { name: Reservation.name, schema: ReservationSchema },
      { name: ShiftTemplate.name, schema: ShiftTemplateSchema },
      { name: ExperienceSession.name, schema: ExperienceSessionSchema },
      { name: RecurringBlock.name, schema: RecurringBlockSchema },
      { name: AppSetting.name, schema: AppSettingSchema },
    ]),
  ],
  controllers: [TablesController],
  providers: [
    TablesService,
    ShiftsService,
    RecurringBlocksService,
    BusinessHoursService,
  ],
  exports: [
    TablesService,
    ShiftsService,
    RecurringBlocksService,
    BusinessHoursService,
  ],
})
export class TablesModule {}

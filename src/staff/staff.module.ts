import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  StaffTask,
  StaffTaskSchema,
} from '../common/schemas/staff-task.schema';
import {
  ShoppingItem,
  ShoppingItemSchema,
} from '../common/schemas/shopping-item.schema';
import { User, UserSchema } from '../common/schemas/user.schema';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StaffTask.name, schema: StaffTaskSchema },
      { name: ShoppingItem.name, schema: ShoppingItemSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [StaffController],
  providers: [StaffService],
  exports: [StaffService],
})
export class StaffModule {}

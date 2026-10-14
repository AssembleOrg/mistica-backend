import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../common/schemas';
import { KilnLog, KilnLogSchema } from './kiln-log.schema';
import { KilnsController } from './kilns.controller';
import { KilnsService } from './kilns.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: KilnLog.name, schema: KilnLogSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [KilnsController],
  providers: [KilnsService],
})
export class KilnsModule {}

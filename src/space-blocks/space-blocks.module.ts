import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SpaceBlocksController } from './space-blocks.controller';
import { SpaceBlocksService } from './space-blocks.service';
import {
  SpaceBlock,
  SpaceBlockSchema,
} from '../common/schemas/space-block.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SpaceBlock.name, schema: SpaceBlockSchema },
    ]),
  ],
  controllers: [SpaceBlocksController],
  providers: [SpaceBlocksService],
  exports: [SpaceBlocksService],
})
export class SpaceBlocksModule {}

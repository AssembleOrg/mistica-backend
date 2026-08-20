import { Module } from '@nestjs/common';
import { SpacesService } from '../common/services/spaces.service';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

@Module({
  controllers: [UploadsController],
  providers: [UploadsService, SpacesService],
  exports: [UploadsService],
})
export class UploadsModule {}

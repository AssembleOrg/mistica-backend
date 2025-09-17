import { PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreateEgressDto } from './create-egress.dto';
import { EgressStatus } from '../enums';

export class UpdateEgressDto extends PartialType(CreateEgressDto) {
  @ApiPropertyOptional({
    description: 'Estado del egreso',
    enum: EgressStatus,
    example: EgressStatus.COMPLETED
  })
  @IsOptional()
  @IsEnum(EgressStatus)
  status?: EgressStatus;
}
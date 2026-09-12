import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateStaffTaskDto {
  @ApiProperty({ description: 'Qué hay que hacer' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title: string;

  @ApiPropertyOptional({ description: 'Detalle' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ description: 'Cuentas de integrantes asignados' })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  assigneeUserIds?: string[];

  /** Compatibilidad con clientes anteriores: se convierte a una lista de uno. */
  @ApiPropertyOptional({ deprecated: true, description: 'Cuenta de un integrante asignado' })
  @IsOptional()
  @IsMongoId()
  assigneeUserId?: string;

  @ApiPropertyOptional({ description: 'Fecha límite (ISO)' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class UpdateStaffTaskDto extends PartialType(CreateStaffTaskDto) {
  @ApiPropertyOptional({ enum: ['PENDING', 'DONE'] })
  @IsOptional()
  @IsIn(['PENDING', 'DONE'])
  status?: 'PENDING' | 'DONE';
}

export class AddStaffTaskCommentDto {
  @ApiProperty({ description: 'Progreso, información, necesidad u observación' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  body: string;
}

export class CreateShoppingItemDto {
  @ApiProperty({ description: 'Producto o insumo que hace falta' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name: string;

  @ApiPropertyOptional({ description: "Cantidad en texto libre ('2 cajas')" })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  quantity?: string;

  @ApiPropertyOptional({ description: 'Notas (marca, dónde se compra…)' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}

export class UpdateShoppingItemDto extends PartialType(CreateShoppingItemDto) {
  @ApiPropertyOptional({ enum: ['PENDING', 'BOUGHT'] })
  @IsOptional()
  @IsIn(['PENDING', 'BOUGHT'])
  status?: 'PENDING' | 'BOUGHT';
}

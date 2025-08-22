import { IsString, IsEmail, IsEnum, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmployeeRole } from '../enums';

export class CreateEmployeeDto {
  @ApiProperty({ description: 'Nombre del empleado' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Email del empleado' })
  @IsEmail()
  email: string;

  @ApiProperty({ enum: EmployeeRole, description: 'Rol del empleado' })
  @IsEnum(EmployeeRole)
  role: EmployeeRole;

  @ApiPropertyOptional({ description: 'Teléfono del empleado' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Dirección del empleado' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ description: 'Fecha de inicio' })
  @IsDateString()
  startDate: string;
}

export class UpdateEmployeeDto {
  @ApiPropertyOptional({ description: 'Nombre del empleado' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Email del empleado' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ enum: EmployeeRole, description: 'Rol del empleado' })
  @IsOptional()
  @IsEnum(EmployeeRole)
  role?: EmployeeRole;

  @ApiPropertyOptional({ description: 'Teléfono del empleado' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Dirección del empleado' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: 'Fecha de inicio' })
  @IsOptional()
  @IsDateString()
  startDate?: string;
} 
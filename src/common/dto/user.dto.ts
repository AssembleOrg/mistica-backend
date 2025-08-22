import { IsString, IsEmail, IsEnum, IsOptional, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../enums';

export class CreateUserDto {
  @ApiProperty({ description: 'Email del usuario' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Nombre del usuario' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Contraseña del usuario' })
  @IsString()
  password: string;

  @ApiProperty({ enum: UserRole, description: 'Rol del usuario' })
  @IsEnum(UserRole)
  role: UserRole;

  @ApiPropertyOptional({ description: 'Avatar del usuario' })
  @IsOptional()
  @IsUrl()
  avatar?: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ description: 'Email del usuario' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Nombre del usuario' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Contraseña del usuario' })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional({ enum: UserRole, description: 'Rol del usuario' })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ description: 'Avatar del usuario' })
  @IsOptional()
  @IsUrl()
  avatar?: string;
}

export class LoginUserDto {
  @ApiProperty({ description: 'Email del usuario' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Contraseña del usuario' })
  @IsString()
  password: string;
} 
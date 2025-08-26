import { IsString, IsEmail, IsEnum, IsOptional, IsUrl, MinLength, MaxLength, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../enums';

export class CreateUserDto {
  @ApiProperty({ description: 'Email del usuario' })
  @IsEmail({}, { message: 'El email debe tener un formato válido' })
  @IsNotEmpty({ message: 'El email es requerido' })
  @MaxLength(255, { message: 'El email no puede exceder 255 caracteres' })
  email: string;

  @ApiProperty({ description: 'Nombre del usuario' })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre es requerido' })
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(100, { message: 'El nombre no puede exceder 100 caracteres' })
  name: string;

  @ApiProperty({ description: 'Contraseña del usuario' })
  @IsString({ message: 'La contraseña debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La contraseña es requerida' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  @MaxLength(128, { message: 'La contraseña no puede exceder 128 caracteres' })
  password: string;

  @ApiProperty({ enum: UserRole, description: 'Rol del usuario' })
  @IsEnum(UserRole, { message: 'El rol debe ser válido' })
  role: UserRole;

  @ApiPropertyOptional({ description: 'Avatar del usuario' })
  @IsOptional()
  @IsUrl({}, { message: 'El avatar debe ser una URL válida' })
  @MaxLength(500, { message: 'La URL del avatar no puede exceder 500 caracteres' })
  avatar?: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ description: 'Email del usuario' })
  @IsOptional()
  @IsEmail({}, { message: 'El email debe tener un formato válido' })
  @MaxLength(255, { message: 'El email no puede exceder 255 caracteres' })
  email?: string;

  @ApiPropertyOptional({ description: 'Nombre del usuario' })
  @IsOptional()
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(100, { message: 'El nombre no puede exceder 100 caracteres' })
  name?: string;

  @ApiPropertyOptional({ description: 'Contraseña del usuario' })
  @IsOptional()
  @IsString({ message: 'La contraseña debe ser una cadena de texto' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  @MaxLength(128, { message: 'La contraseña no puede exceder 128 caracteres' })
  password?: string;

  @ApiPropertyOptional({ enum: UserRole, description: 'Rol del usuario' })
  @IsOptional()
  @IsEnum(UserRole, { message: 'El rol debe ser válido' })
  role?: UserRole;

  @ApiPropertyOptional({ description: 'Avatar del usuario' })
  @IsOptional()
  @IsUrl({}, { message: 'El avatar debe ser una URL válida' })
  @MaxLength(500, { message: 'La URL del avatar no puede exceder 500 caracteres' })
  avatar?: string;
}

export class LoginUserDto {
  @ApiProperty({ description: 'Email del usuario' }) 
  @IsEmail({}, { message: 'El email debe tener un formato válido' })
  @IsNotEmpty({ message: 'El email es requerido' })
  email: string;

  @ApiProperty({ description: 'Contraseña del usuario' })
  @IsString({ message: 'La contraseña debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La contraseña es requerida' })
  password: string;
} 
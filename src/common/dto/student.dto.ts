import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateStudentDto {
  @ApiProperty({ description: 'Nombre y apellido del alumno' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ description: 'Cliente existente a asociar' })
  @IsOptional()
  @IsMongoId()
  clientId?: string;

  @ApiPropertyOptional({ description: 'Teléfono / WhatsApp' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional({ description: 'Email' })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ description: 'Adulto responsable (escuelita)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  guardianName?: string;

  @ApiPropertyOptional({ description: 'Fecha de nacimiento (ISO)' })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional({ description: 'Fecha de incorporación al taller (ISO)' })
  @IsOptional()
  @IsDateString()
  joinedAt?: string;

  @ApiPropertyOptional({ description: 'Notas administrativas' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  adminNotes?: string;

  @ApiPropertyOptional({ description: 'Notas de práctica (las ve el profesor)' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  practicalNotes?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateStudentDto extends PartialType(CreateStudentDto) {}

export class CreateStudentPaymentDto {
  @ApiProperty({ description: "Concepto ('Cuota agosto 2026')" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  concept: string;

  @ApiProperty({ description: 'Importe (ARS)', minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiPropertyOptional({
    enum: ['PAID', 'PENDING'],
    description: 'PAID = abonado; PENDING = cuota a cobrar',
    default: 'PENDING',
  })
  @IsOptional()
  @IsIn(['PAID', 'PENDING'])
  status?: 'PAID' | 'PENDING';

  @ApiPropertyOptional({ description: 'Fecha de pago (ISO, sólo PAID)' })
  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @ApiPropertyOptional({ description: 'Vencimiento (ISO)' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ description: 'Medio de pago (texto libre)' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  method?: string;

  @ApiPropertyOptional({ description: 'Notas' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateStudentPaymentDto extends PartialType(
  CreateStudentPaymentDto,
) {}

export class AttendanceRecordDto {
  @ApiProperty({ description: 'Alumno' })
  @IsMongoId()
  studentId: string;

  @ApiProperty({
    enum: ['PRESENT', 'ABSENT', 'MAKEUP'],
    description: 'MAKEUP = vino a recuperar una clase',
  })
  @IsIn(['PRESENT', 'ABSENT', 'MAKEUP'])
  status: 'PRESENT' | 'ABSENT' | 'MAKEUP';

  @ApiPropertyOptional({ description: 'Notas' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}

export class SaveAttendanceDto {
  @ApiProperty({ description: 'Grupo' })
  @IsMongoId()
  groupId: string;

  @ApiProperty({ description: "Día de la clase, 'YYYY-MM-DD'" })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date debe ser YYYY-MM-DD' })
  date: string;

  @ApiProperty({ type: [AttendanceRecordDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttendanceRecordDto)
  records: AttendanceRecordDto[];
}

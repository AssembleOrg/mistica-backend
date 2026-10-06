import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
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

  @ApiPropertyOptional({
    description: 'Fecha de incorporación al taller (ISO)',
  })
  @IsOptional()
  @IsDateString()
  joinedAt?: string;

  @ApiPropertyOptional({
    description: 'Día del mes límite para pagar la cuota (1-31, default 10)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  paymentDay?: number;

  @ApiPropertyOptional({ description: 'Importe de la cuota mensual (ARS)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlyFee?: number;

  @ApiPropertyOptional({ description: 'Notas administrativas' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  adminNotes?: string;

  @ApiPropertyOptional({
    description: 'Notas de práctica (las ve el profesor)',
  })
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

/** Cobrar una cuota pendiente: entera o una parte (queda el saldo). */
export class CollectStudentPaymentDto {
  @ApiProperty({
    description:
      'Lo que se cobra ahora (ARS). Menos que el importe de la cuota = pago parcial: la cuota sigue pendiente por el saldo.',
    minimum: 0.01,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;

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

  @ApiPropertyOptional({
    description:
      'Sólo pago parcial: nuevo vencimiento del saldo (ISO). Si no viene, sigue el de la cuota.',
  })
  @IsOptional()
  @IsDateString()
  balanceDueDate?: string;
}

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

  @ApiPropertyOptional({
    description: 'Grupo de la clase original que recupera',
  })
  @IsOptional()
  @IsMongoId()
  makeupForGroupId?: string;

  @ApiPropertyOptional({
    description: "Fecha de la clase original, 'YYYY-MM-DD'",
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'makeupForDate debe ser YYYY-MM-DD',
  })
  makeupForDate?: string;

  @ApiPropertyOptional({ description: 'Notas' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;

  @ApiPropertyOptional({
    description: 'Clase de prueba gratuita (una sola por alumno)',
  })
  @IsOptional()
  @IsBoolean()
  trial?: boolean;
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

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Agendar una clase de prueba: alumno existente o una persona nueva. */
export class ScheduleTrialDto {
  @ApiProperty({ description: 'Grupo que viene a probar' })
  @IsMongoId()
  groupId: string;

  @ApiProperty({ description: "Día de la clase, 'YYYY-MM-DD'" })
  @Matches(YMD, { message: 'La fecha va en formato YYYY-MM-DD' })
  date: string;

  @ApiPropertyOptional({ description: 'Alumno ya cargado (si no, nombre y teléfono)' })
  @IsOptional()
  @IsMongoId()
  studentId?: string;

  @ApiPropertyOptional({ description: 'Nombre de quien viene a probar' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;

  @ApiPropertyOptional({
    description: 'Quién la agenda (cuentas compartidas). Si no viene, el nombre de la cuenta.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  doneBy?: string;
}

/** Inscribir en el grupo a quien vino a probar: desde cuándo cursa y paga. */
export class EnrollTrialDto {
  @ApiProperty({ description: "Desde qué clase cursa y paga, 'YYYY-MM-DD'" })
  @Matches(YMD, { message: 'La fecha va en formato YYYY-MM-DD' })
  startDate: string;

  @ApiProperty({ description: 'Día límite de pago de cada mes', minimum: 1, maximum: 31 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  paymentDay: number;

  @ApiPropertyOptional({ description: 'Cuota mensual' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlyFee?: number;

  @ApiPropertyOptional({
    description:
      'Monto de la primera cuota (p. ej. el proporcional para pasar al día de pago). Si no viene, la cuota mensual.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  firstAmount?: number;
}

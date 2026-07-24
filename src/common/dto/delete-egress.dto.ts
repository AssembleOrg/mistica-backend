import { IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Autorización para borrar un egreso. Con cuenta admin compartida, el borrado
 * es una acción sensible: exige el PIN del dueño (secreto cómodo del día a día)
 * o, como respaldo si lo olvidó en el momento, la contraseña del admin (secreto
 * raíz). Se debe enviar al menos uno de los dos; el service valida cuál.
 *
 * El `reason` es obligatorio y queda registrado en la auditoría (ej. "duplicado
 * pago EDESUR").
 */
export class DeleteEgressDto {
  @ApiProperty({
    description: 'Motivo del borrado (queda auditado)',
    example: 'Egreso duplicado por error — pago EDESUR cargado dos veces',
    minLength: 3,
  })
  @IsString()
  @MinLength(3, { message: 'El motivo debe tener al menos 3 caracteres' })
  reason: string;

  @ApiPropertyOptional({
    description: 'PIN de 4 a 6 dígitos para autorizar el borrado',
    example: '4821',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4,6}$/, { message: 'El PIN debe ser numérico de 4 a 6 dígitos' })
  pin?: string;

  @ApiPropertyOptional({
    description: 'Alternativa al PIN: contraseña del admin',
    example: 'miContraseñaAdmin',
  })
  @IsOptional()
  @IsString()
  adminPassword?: string;
}

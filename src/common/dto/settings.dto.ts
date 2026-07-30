import { IsString, Matches, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Configura / cambia / resetea el PIN para borrar egresos.
 *
 * Requiere la contraseña del admin como secreto raíz: es lo único que el dueño
 * tiene y el cajero no (el cajero sólo usa la sesión abierta, no conoce la
 * contraseña). Así, "olvidé el PIN" se resuelve confirmando la contraseña y
 * poniendo uno nuevo, sin depender de que lo haya anotado ni de email.
 */
export class SetCashDeletePinDto {
  @ApiProperty({
    description: 'Contraseña de la cuenta admin (para autorizar el cambio de PIN)',
    example: 'miContraseñaAdmin',
  })
  @IsString()
  @MinLength(1)
  adminPassword: string;

  @ApiProperty({
    description: 'Nuevo PIN numérico de 4 a 6 dígitos',
    example: '4821',
  })
  @IsString()
  @Matches(/^\d{4,6}$/, {
    message: 'El PIN debe ser numérico de 4 a 6 dígitos',
  })
  newPin: string;
}

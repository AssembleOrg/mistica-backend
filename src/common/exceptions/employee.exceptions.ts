import { HttpException, HttpStatus } from '@nestjs/common';

export class EmpleadoNoEncontradoException extends HttpException {
  constructor(id: string) {
    super(`Empleado con ID ${id} no encontrado`, HttpStatus.NOT_FOUND);
  }
}

export class EmailYaExisteException extends HttpException {
  constructor(email: string) {
    super(`El email ${email} ya está registrado`, HttpStatus.CONFLICT);
  }
} 
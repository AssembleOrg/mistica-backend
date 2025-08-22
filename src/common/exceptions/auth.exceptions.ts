import { HttpException, HttpStatus } from '@nestjs/common';

export class CredencialesInvalidasException extends HttpException {
  constructor() {
    super('Credenciales inválidas', HttpStatus.UNAUTHORIZED);
  }
}

export class NoAutorizadoException extends HttpException {
  constructor() {
    super('No tienes autorización para realizar esta acción', HttpStatus.FORBIDDEN);
  }
} 
import { HttpException, HttpStatus } from '@nestjs/common';

export class UsuarioNoEncontradoException extends HttpException {
  constructor(id: string) {
    super(`Usuario con ID ${id} no encontrado`, HttpStatus.NOT_FOUND);
  }
} 
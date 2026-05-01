import { HttpException, HttpStatus } from '@nestjs/common';

export class CajaYaAbiertaException extends HttpException {
  constructor() {
    super('Ya hay una sesión de caja abierta. Cerrala antes de abrir una nueva.', HttpStatus.CONFLICT);
  }
}

export class CajaNoAbiertaException extends HttpException {
  constructor() {
    super(
      'No hay una sesión de caja abierta. Abrí caja antes de operar.',
      HttpStatus.CONFLICT,
    );
  }
}

export class SesionDeCajaNoEncontradaException extends HttpException {
  constructor(id: string) {
    super(`Sesión de caja con ID ${id} no encontrada`, HttpStatus.NOT_FOUND);
  }
}

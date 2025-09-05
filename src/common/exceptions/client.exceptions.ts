import { HttpException, HttpStatus } from '@nestjs/common';

export class ClienteNoEncontradoException extends HttpException {
  constructor(id: string) {
    super(`Cliente con ID ${id} no encontrado`, HttpStatus.NOT_FOUND);
  }
}

export class EmailClienteYaExisteException extends HttpException {
  constructor(email: string) {
    super(`El email ${email} ya está registrado para otro cliente`, HttpStatus.CONFLICT);
  }
}

export class CuitClienteYaExisteException extends HttpException {
  constructor(cuit: string) {
    super(`El CUIT ${cuit} ya está registrado para otro cliente`, HttpStatus.CONFLICT);
  }
}

export class PrepaidNoEncontradoException extends HttpException {
  constructor(id: string) {
    super(`Prepaid con ID ${id} no encontrado`, HttpStatus.NOT_FOUND);
  }
}

export class PrepaidYaConsumidoException extends HttpException {
  constructor(id: string) {
    super(`El prepaid ${id} ya ha sido consumido`, HttpStatus.BAD_REQUEST);
  }
}

export class PrepaidInsuficienteException extends HttpException {
  constructor(availableAmount: number, requestedAmount: number) {
    super(
      `Prepaid insuficiente. Monto disponible: ${availableAmount}, Monto solicitado: ${requestedAmount}`,
      HttpStatus.BAD_REQUEST
    );
  }
}

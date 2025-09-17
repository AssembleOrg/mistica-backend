import { HttpException, HttpStatus } from '@nestjs/common';

export class EgressNotFoundException extends HttpException {
  constructor(egressId: string) {
    super(`Egreso con ID ${egressId} no encontrado`, HttpStatus.NOT_FOUND);
  }
}

export class EgressNumberAlreadyExistsException extends HttpException {
  constructor(egressNumber: string) {
    super(`Ya existe un egreso con el número ${egressNumber}`, HttpStatus.CONFLICT);
  }
}

export class EgressCannotBeUpdatedException extends HttpException {
  constructor(reason: string) {
    super(`El egreso no puede ser actualizado: ${reason}`, HttpStatus.BAD_REQUEST);
  }
}

export class EgressCannotBeDeletedException extends HttpException {
  constructor(reason: string) {
    super(`El egreso no puede ser eliminado: ${reason}`, HttpStatus.BAD_REQUEST);
  }
}

export class InvalidEgressDataException extends HttpException {
  constructor(message: string) {
    super(`Datos de egreso inválidos: ${message}`, HttpStatus.BAD_REQUEST);
  }
}
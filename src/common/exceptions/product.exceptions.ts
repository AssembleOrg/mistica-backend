import { HttpException, HttpStatus } from '@nestjs/common';

export class ProductoNoEncontradoException extends HttpException {
  constructor(id: string) {
    super(`Producto con ID ${id} no encontrado`, HttpStatus.NOT_FOUND);
  }
}

export class CodigoBarrasYaExisteException extends HttpException {
  constructor(barcode: string) {
    super(`El código de barras ${barcode} ya está registrado`, HttpStatus.CONFLICT);
  }
}

export class StockInsuficienteException extends HttpException {
  constructor(producto: string, stockDisponible: number, stockSolicitado: number) {
    super(
      `Stock insuficiente para el producto ${producto}. Disponible: ${stockDisponible}, Solicitado: ${stockSolicitado}`,
      HttpStatus.BAD_REQUEST
    );
  }
}

export class PrecioInvalidoException extends HttpException {
  constructor() {
    super('El precio de venta debe ser mayor al precio de costo', HttpStatus.BAD_REQUEST);
  }
} 
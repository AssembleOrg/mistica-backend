import { HttpException, HttpStatus } from '@nestjs/common';

export class VentaNoEncontradaException extends HttpException {
  constructor(id: string) {
    super(`Venta con ID ${id} no encontrada`, HttpStatus.NOT_FOUND);
  }
}

export class NumeroVentaYaExisteException extends HttpException {
  constructor(saleNumber: string) {
    super(`El número de venta ${saleNumber} ya existe`, HttpStatus.CONFLICT);
  }
}

export class ProductoNoEncontradoEnVentaException extends HttpException {
  constructor(productId: string) {
    super(`Producto con ID ${productId} no encontrado`, HttpStatus.BAD_REQUEST);
  }
}

export class StockInsuficienteEnVentaException extends HttpException {
  constructor(productName: string, availableStock: number, requestedQuantity: number) {
    super(
      `Stock insuficiente para ${productName}. Stock disponible: ${availableStock}, Cantidad solicitada: ${requestedQuantity}`,
      HttpStatus.BAD_REQUEST
    );
  }
}

export class VentaYaCompletadaException extends HttpException {
  constructor(saleNumber: string) {
    super(`La venta ${saleNumber} ya está completada y no puede ser modificada`, HttpStatus.BAD_REQUEST);
  }
}

export class VentaCanceladaException extends HttpException {
  constructor(saleNumber: string) {
    super(`La venta ${saleNumber} está cancelada y no puede ser modificada`, HttpStatus.BAD_REQUEST);
  }
}

import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DateTime } from 'luxon';
import { CreateSaleDto, UpdateSaleDto, PaginationDto, DailySalesQueryDto } from '../common/dto';
import { Sale, SaleItem, DailySalesResponse, DailySalesSummary, PaginatedResponse } from '../common/interfaces';
import { 
  VentaNoEncontradaException, 
  NumeroVentaYaExisteException,
  ProductoNoEncontradoEnVentaException,
  StockInsuficienteEnVentaException,
  VentaYaCompletadaException,
  VentaCanceladaException,
  ClienteNoEncontradoException,
  PrepaidInsuficienteException,
  PrepaidNoEncontradoException,
  PrepaidYaConsumidoException
} from '../common/exceptions';
import { SaleDocument, ProductDocument, ClientDocument } from '../common/schemas';
import { PaymentMethod, PrepaidStatus, SaleStatus } from '../common/enums';
import { PrepaidsService } from '../prepaids/prepaids.service';

@Injectable()
export class SalesService {
  constructor(
    @InjectModel('Sale') private readonly saleModel: Model<SaleDocument>,
    @InjectModel('Product') private readonly productModel: Model<ProductDocument>,
    @InjectModel('Client') private readonly clientModel: Model<ClientDocument>,
    private readonly prepaidsService: PrepaidsService,
  ) {}

  private mapToSaleResponse(sale: SaleDocument): Sale {
    const saleObj = sale.toObject();
    return {
      id: saleObj._id.toString(),
      saleNumber: saleObj.saleNumber,
      clientId: saleObj.clientId?.toString(),
      customerName: saleObj.customerName,
      customerEmail: saleObj.customerEmail,
      customerPhone: saleObj.customerPhone,
      items: saleObj.items.map(item => ({
        productId: item.productId.toString(),
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
      })),
      subtotal: saleObj.subtotal,
      tax: saleObj.tax,
      discount: saleObj.discount,
      prepaidId: saleObj.prepaidId?.toString(),
      total: saleObj.total,
      paymentMethod: saleObj.paymentMethod,
      status: saleObj.status,
      notes: saleObj.notes,
      createdAt: saleObj.createdAt,
      updatedAt: saleObj.updatedAt,
      deletedAt: saleObj.deletedAt,
    };
  }

  private async generateSaleNumber(): Promise<string> {
    const today = DateTime.now().setZone('America/Argentina/Buenos_Aires');
    const year = today.year;
    const month = today.month.toString().padStart(2, '0');
    const day = today.day.toString().padStart(2, '0');
    
    const datePrefix = `V-${year}-${month}${day}`;
    
    const lastSale = await this.saleModel
      .findOne({ saleNumber: { $regex: `^${datePrefix}` } })
      .sort({ saleNumber: -1 })
      .exec();

    if (!lastSale) {
      return `${datePrefix}-001`;
    }

    const lastNumber = parseInt(lastSale.saleNumber.split('-').pop() || '0');
    const newNumber = (lastNumber + 1).toString().padStart(3, '0');
    
    return `${datePrefix}-${newNumber}`;
  }

  private async validateAndProcessItems(items: any[]): Promise<SaleItem[]> {
    const processedItems: SaleItem[] = [];
    let subtotal = 0;

    for (const item of items) {
      // Verificar que el producto existe
      const product = await this.productModel.findOne({
        _id: item.productId,
        deletedAt: { $exists: false }
      }).exec();

      if (!product) {
        throw new ProductoNoEncontradoEnVentaException(item.productId);
      }

      // Verificar stock disponible
      if (product.stock < item.quantity) {
        throw new StockInsuficienteEnVentaException(product.name, product.stock, item.quantity);
      }

      const itemSubtotal = item.quantity * item.unitPrice;
      subtotal += itemSubtotal;

      processedItems.push({
        productId: item.productId,
        productName: product.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: itemSubtotal,
      });
    }

    return processedItems;
  }

  private async updateProductStock(items: SaleItem[], operation: 'add' | 'subtract'): Promise<void> {
    for (const item of items) {
      const product = await this.productModel.findById(item.productId).exec();
      if (!product) continue;

      let newStock = product.stock;
      if (operation === 'add') {
        newStock += item.quantity;
      } else if (operation === 'subtract') {
        newStock -= item.quantity;
      }

      await this.productModel.findByIdAndUpdate(item.productId, { stock: newStock }).exec();
    }
  }

  private async consumeSpecificPrepaid(prepaidId: string, amount: number): Promise<{ consumed: number; remaining: number; prepaidAmount: number }> {
    try {
      // Verificar que el prepaid existe y está pendiente
      const prepaid = await this.prepaidsService.findOne(prepaidId);
      console.table(prepaid);
      
      if (prepaid.status !== 'PENDING') {
        throw new PrepaidYaConsumidoException(prepaidId);
      }

      // Obtener el monto total del prepaid
      const prepaidAmount = prepaid.amount;

      // Actualizar el status del prepaid a consumido
      await this.prepaidsService.updateStatus(prepaidId, PrepaidStatus.CONSUMED);

      // Devolver el monto total del prepaid como consumido
      return { 
        consumed: prepaidAmount, 
        remaining: 0,
        prepaidAmount: prepaidAmount
      };
    } catch (error) {
      if (error instanceof PrepaidNoEncontradoException || 
          error instanceof PrepaidYaConsumidoException ||
          error instanceof PrepaidInsuficienteException) {
        throw error;
      }
      console.error('Error consuming specific prepaid:', error);
      throw new BadRequestException('Error al consumir el prepaid especificado');
    }
  }

  async create(createSaleDto: CreateSaleDto): Promise<Sale> {
    try {
      // Validar que el cliente existe solo si se proporciona clientId
      let client: ClientDocument | null = null;
      console.table(createSaleDto);
      if (createSaleDto.clientId) {
        client = await this.clientModel.findOne({
          _id: createSaleDto.clientId,
          deletedAt: { $exists: false }
        }).exec();

        if (!client) {
          throw new ClienteNoEncontradoException(createSaleDto.clientId);
        }
      }

      // Validar y procesar items
      const processedItems = await this.validateAndProcessItems(createSaleDto.items);
      
      // Generar número de venta único
      const saleNumber = await this.generateSaleNumber();

      // Calcular totales
      const subtotal = processedItems.reduce((sum, item) => sum + item.subtotal, 0);
      const tax = 0; // Por ahora sin impuestos
      const discount = 0; // Por ahora sin descuentos
      const total = subtotal + tax - discount;

      // Manejar consumo de prepaids según los parámetros (solo si hay cliente)
      let prepaidUsed = 0;
      let prepaidId: string | undefined = undefined;
      
      if (createSaleDto.consumedPrepaid && createSaleDto.prepaidId) {
        // Consumir prepaid específico
        try {
          const prepaidResult = await this.consumeSpecificPrepaid(createSaleDto.prepaidId, total);
          prepaidUsed = prepaidResult.consumed;
          prepaidId = createSaleDto.prepaidId;
        } catch (prepaidError) {
          if (prepaidError instanceof PrepaidInsuficienteException || 
              prepaidError instanceof PrepaidNoEncontradoException ||
              prepaidError instanceof PrepaidYaConsumidoException) {
            throw prepaidError;
          }
          throw new BadRequestException('Error al consumir el prepaid especificado');
        }
      } else if (createSaleDto.clientId && createSaleDto.paymentMethod === PaymentMethod.CASH) {
        // Consumo automático por monto total (lógica anterior)
        try {
          const prepaidResult = await this.prepaidsService.consumePrepaidAmount(createSaleDto.clientId, total);
          prepaidUsed = prepaidResult.consumed;
        } catch (prepaidError) {
          if (prepaidError instanceof PrepaidInsuficienteException) {
            throw prepaidError;
          }
          // Si no hay prepaids suficientes, continuar con el método de pago original
        }
      }

      // Crear la venta
      const sale = await this.saleModel.create({
        saleNumber,
        clientId: createSaleDto.clientId,
        customerName: createSaleDto.customerName,
        customerEmail: createSaleDto.customerEmail?.toLowerCase(),
        customerPhone: createSaleDto.customerPhone,
        items: processedItems,
        subtotal,
        tax,
        discount: prepaidUsed,
        prepaidId: prepaidId,
        total: total - prepaidUsed, // Aplicar descuento al total
        paymentMethod: createSaleDto.paymentMethod,
        status: SaleStatus.PENDING,
        notes: createSaleDto.notes,
      });

      if (!sale || !sale._id) {
        throw new BadRequestException('Error al crear la venta');
      }

      // Actualizar stock de productos
      await this.updateProductStock(processedItems, 'subtract');

      // Marcar venta como completada
      await this.saleModel.findByIdAndUpdate(sale._id, { status: SaleStatus.COMPLETED }).exec();

      return this.mapToSaleResponse(sale);
    } catch (error) {
      if (error instanceof ClienteNoEncontradoException || 
          error instanceof ProductoNoEncontradoEnVentaException || 
          error instanceof StockInsuficienteEnVentaException ||
          error instanceof PrepaidInsuficienteException ||
          error instanceof BadRequestException) {
        throw error;
      }
      console.error('Error creating sale:', error);
      throw new BadRequestException('Error durante la creación de la venta');
    }
  }

  async findAll(paginationDto?: PaginationDto): Promise<PaginatedResponse<Sale>> {
    const { page = 1, limit = 10 } = paginationDto || {};
    const skip = (page - 1) * limit;

    const [sales, total] = await Promise.all([
      this.saleModel.find({ deletedAt: { $exists: false } })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.saleModel.countDocuments({ deletedAt: { $exists: false } }).exec(),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: sales.map(sale => this.mapToSaleResponse(sale)),
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async findWithoutPagination(): Promise<Sale[]> {
    const sales = await this.saleModel.find({ 
      deletedAt: { $exists: false } 
    }).sort({ createdAt: -1 }).exec();

    return sales.map(sale => this.mapToSaleResponse(sale));
  }

  async findOne(id: string): Promise<Sale> {
    const sale = await this.saleModel.findOne({
      _id: id,
      deletedAt: { $exists: false }
    }).exec();

    if (!sale) {
      throw new VentaNoEncontradaException(id);
    }

    return this.mapToSaleResponse(sale);
  }

  async update(id: string, updateSaleDto: UpdateSaleDto): Promise<Sale> {
    try {
      const existingSale = await this.findOne(id);

      // Verificar que la venta no esté completada o cancelada
      if (existingSale.status === SaleStatus.COMPLETED) {
        throw new VentaYaCompletadaException(existingSale.saleNumber);
      }

      if (existingSale.status === SaleStatus.CANCELLED) {
        throw new VentaCanceladaException(existingSale.saleNumber);
      }

      let updateData: any = { ...updateSaleDto };

      // Manejar cambios en prepaidId
      if (updateSaleDto.prepaidId !== undefined) {
        // Si hay un prepaidId anterior, restaurarlo a PENDING
        if (existingSale.prepaidId) {
          try {
            await this.prepaidsService.updateStatus(existingSale.prepaidId, PrepaidStatus.PENDING);
          } catch (error) {
            console.error('Error al restaurar prepaid anterior:', error);
          }
        }

        // Si se proporciona un nuevo prepaidId, consumirlo
        if (updateSaleDto.prepaidId && updateSaleDto.consumedPrepaid) {
          try {
            const prepaidResult = await this.consumeSpecificPrepaid(updateSaleDto.prepaidId, existingSale.total);
            updateData.discount = prepaidResult.consumed;
            updateData.total = existingSale.subtotal + (updateData.tax || 0) - prepaidResult.consumed;
          } catch (prepaidError) {
            if (prepaidError instanceof PrepaidInsuficienteException || 
                prepaidError instanceof PrepaidNoEncontradoException ||
                prepaidError instanceof PrepaidYaConsumidoException) {
              throw prepaidError;
            }
            throw new BadRequestException('Error al consumir el prepaid especificado');
          }
        } else if (updateSaleDto.prepaidId === null || updateSaleDto.prepaidId === '') {
          // Si se elimina el prepaidId, quitar descuento
          updateData.discount = 0;
          updateData.total = existingSale.subtotal + (updateData.tax || 0);
        }
      }

      // Si se actualizan los items, procesarlos
      if (updateSaleDto.items) {
        // Restaurar stock de items anteriores
        await this.updateProductStock(existingSale.items, 'add');

        // Procesar nuevos items
        const processedItems = await this.validateAndProcessItems(updateSaleDto.items);
        
        // Actualizar stock con nuevos items
        await this.updateProductStock(processedItems, 'subtract');

        // Calcular nuevos totales
        const subtotal = processedItems.reduce((sum, item) => sum + item.subtotal, 0);
        const tax = 0;
        const discount = updateData.discount || 0; // Usar descuento existente si hay prepaid
        const total = subtotal + tax - discount;

        updateData = {
          ...updateData,
          items: processedItems,
          subtotal,
          tax,
          discount,
          total,
        };
      }

      // Normalizar email si se proporciona
      if (updateSaleDto.customerEmail) {
        updateData.customerEmail = updateSaleDto.customerEmail.toLowerCase();
      }

      const sale = await this.saleModel.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      ).exec();

      if (!sale) {
        throw new VentaNoEncontradaException(id);
      }

      return this.mapToSaleResponse(sale);
    } catch (error) {
      if (error instanceof VentaNoEncontradaException || 
          error instanceof VentaYaCompletadaException ||
          error instanceof VentaCanceladaException ||
          error instanceof ProductoNoEncontradoEnVentaException ||
          error instanceof StockInsuficienteEnVentaException) {
        throw error;
      }
      console.error('Error updating sale:', error);
      throw new BadRequestException('Error durante la actualización de la venta');
    }
  }

  async remove(id: string): Promise<void> {
    const sale = await this.findOne(id);
    
    // Restaurar stock de productos
    await this.updateProductStock(sale.items, 'add');
    
    // Restaurar prepaid si existe
    if (sale.prepaidId) {
      try {
        await this.prepaidsService.updateStatus(sale.prepaidId, PrepaidStatus.PENDING);
      } catch (error) {
        console.error('Error al restaurar prepaid:', error);
        // No lanzar error para no interrumpir el borrado de la venta
      }
    }
    
    // Soft delete
    await this.saleModel.findByIdAndUpdate(id, {
      deletedAt: new Date()
    }).exec();
  }

  async getDailySales(query: DailySalesQueryDto): Promise<DailySalesResponse> {
    try {
      const timezone = query.timezone || 'America/Argentina/Buenos_Aires';
      const targetDate = query.date 
        ? DateTime.fromISO(query.date, { zone: timezone })
        : DateTime.now().setZone(timezone);

      const startOfDay = targetDate.startOf('day').toJSDate();
      const endOfDay = targetDate.endOf('day').toJSDate();

      const sales = await this.saleModel.find({
        createdAt: {
          $gte: startOfDay,
          $lte: endOfDay
        },
        deletedAt: { $exists: false }
      }).sort({ createdAt: -1 }).exec();

      // Calcular resumen
      const summary: DailySalesSummary = {
        totalSales: sales.length,
        totalAmount: sales.reduce((sum, sale) => sum + sale.total, 0),
        totalByPaymentMethod: {
          [PaymentMethod.CASH]: 0,
          [PaymentMethod.CARD]: 0,
          [PaymentMethod.TRANSFER]: 0,
        },
        totalByStatus: {
          [SaleStatus.PENDING]: 0,
          [SaleStatus.COMPLETED]: 0,
          [SaleStatus.CANCELLED]: 0,
        },
      };

      sales.forEach(sale => {
        summary.totalByPaymentMethod[sale.paymentMethod] += sale.total;
        summary.totalByStatus[sale.status] += 1;
      });

      return {
        date: targetDate.toISODate() || '',
        timezone,
        sales: sales.map(sale => ({
          id: sale._id?.toString() || '',
          saleNumber: sale.saleNumber,
          customerName: sale.customerName,
          total: sale.total,
          paymentMethod: sale.paymentMethod,
          status: sale.status,
          createdAt: sale.createdAt,
        })),
        summary,
      };
    } catch (error) {
      console.error('Error getting daily sales:', error);
      throw new BadRequestException('Error al obtener las ventas del día');
    }
  }
}

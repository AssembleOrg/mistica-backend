import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DateTime } from 'luxon';
import { CreateSaleDto, UpdateSaleDto, SalesPaginatedFilterDto, DailySalesQueryDto } from '../common/dto';
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
import { buildDateFilter } from '../common/utils';

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
      prepaidUsed: saleObj.prepaidUsed || 0,
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

  private calculateTotal(subtotal: number, taxPercent: number = 0, discountPercent: number = 0, prepaidUsed: number = 0): { 
    taxAmount: number; 
    discountAmount: number; 
    total: number; 
  } {
    const taxAmount = (subtotal * taxPercent) / 100;
    const discountAmount = (subtotal * discountPercent) / 100;
    const total = subtotal + taxAmount - discountAmount - prepaidUsed;
    
    return {
      taxAmount,
      discountAmount,
      total: Math.max(0, total) // Asegurar que el total no sea negativo
    };
  }

  private validatePrepaidUsed(prepaidUsed: number, subtotal: number, taxPercent: number = 0, discountPercent: number = 0): void {
    const maxTotal = subtotal + (subtotal * taxPercent / 100) - (subtotal * discountPercent / 100);
    if (prepaidUsed > maxTotal) {
      throw new BadRequestException(`El monto de prepaid usado (${prepaidUsed}) no puede ser mayor al total de la venta (${maxTotal})`);
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
      const taxPercent = createSaleDto.tax || 0;
      const discountPercent = createSaleDto.discount || 0;
      let prepaidUsed = createSaleDto.prepaidUsed || 0;

      // Manejar consumo de prepaids según los parámetros (solo si hay cliente)
      let prepaidId: string | undefined = undefined;
      
      if (createSaleDto.consumedPrepaid && createSaleDto.prepaidId) {
        // Consumir prepaid específico
        try {
          const prepaidResult = await this.consumeSpecificPrepaid(createSaleDto.prepaidId, subtotal);
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
      } else if (createSaleDto.clientId && createSaleDto.paymentMethod === PaymentMethod.CASH && !createSaleDto.prepaidUsed) {
        // Consumo automático por monto total (lógica anterior) solo si no se especificó prepaidUsed manualmente
        try {
          const tempTotal = this.calculateTotal(subtotal, taxPercent, discountPercent, 0).total;
          const prepaidResult = await this.prepaidsService.consumePrepaidAmount(createSaleDto.clientId, tempTotal);
          prepaidUsed = prepaidResult.consumed;
        } catch (prepaidError) {
          if (prepaidError instanceof PrepaidInsuficienteException) {
            throw prepaidError;
          }
          // Si no hay prepaids suficientes, continuar con el método de pago original
        }
      }

      // Validar que prepaidUsed no sea mayor al total
      this.validatePrepaidUsed(prepaidUsed, subtotal, taxPercent, discountPercent);

      // Calcular totales finales
      const totals = this.calculateTotal(subtotal, taxPercent, discountPercent, prepaidUsed);

      // Crear la venta
      const sale = await this.saleModel.create({
        saleNumber,
        clientId: createSaleDto.clientId,
        customerName: createSaleDto.customerName,
        customerEmail: createSaleDto.customerEmail?.toLowerCase(),
        customerPhone: createSaleDto.customerPhone,
        items: processedItems,
        subtotal,
        tax: taxPercent,
        discount: discountPercent,
        prepaidUsed,
        prepaidId: prepaidId,
        total: totals.total,
        paymentMethod: createSaleDto.paymentMethod,
        status: SaleStatus.PENDING,
        notes: createSaleDto.notes,
      });

      if (!sale || !sale._id) {
        throw new BadRequestException('Error al crear la venta');
      }

      // Actualizar stock de productos
      await this.updateProductStock(processedItems, 'subtract');

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

  async findAll(paginationDto?: SalesPaginatedFilterDto): Promise<PaginatedResponse<Sale>> {
    const { page = 1, limit = 10, search, from, to, status } = paginationDto || {};
    const skip = (page - 1) * limit;

    // Construir filtros
    const filters: any = { deletedAt: { $exists: false } };
    
    // Filtro de búsqueda por nombre de cliente o número de venta
    if (search) {
      filters.$or = [
        { customerName: { $regex: search, $options: 'i' } },
        { saleNumber: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Filtro por status
    if (status) {
      filters.status = status;
    }
    
    // Filtros de fecha
    const dateFilter = buildDateFilter(from, to);
    Object.assign(filters, dateFilter);

    const [sales, total] = await Promise.all([
      this.saleModel.find(filters)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.saleModel.countDocuments(filters).exec(),
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

      // Verificar que la venta no esté ya cancelada
      if (existingSale.status === SaleStatus.CANCELLED) {
        throw new VentaCanceladaException(existingSale.saleNumber);
      }

      // Solo permitir cancelación si la venta está completada o pendiente
      if (updateSaleDto.status === SaleStatus.CANCELLED) {
        // Permitir cancelación desde cualquier estado excepto ya cancelada
      } else {
        // Para otros cambios, verificar que no esté completada o cancelada  
        if (existingSale.status === SaleStatus.COMPLETED) {
          throw new VentaYaCompletadaException(existingSale.saleNumber);
        }
      }

      let updateData: any = { ...updateSaleDto };

      // Manejar cancelación de venta - restaurar prepaid
      if (updateSaleDto.status === SaleStatus.CANCELLED) {
        // Si se está cancelando la venta y tenía un prepaid asociado, restaurarlo
        if (existingSale.prepaidId) {
          try {
            await this.prepaidsService.updateStatus(existingSale.prepaidId, PrepaidStatus.PENDING);
            console.log(`Prepaid ${existingSale.prepaidId} restaurado a PENDING debido a cancelación de venta ${existingSale.saleNumber}`);
          } catch (error) {
            console.error('Error al restaurar prepaid durante cancelación:', error);
            // No lanzar error para no interrumpir la cancelación
          }
        }
        
        // Restaurar stock de productos al cancelar
        await this.updateProductStock(existingSale.items, 'add');
        console.log(`Stock restaurado para venta cancelada ${existingSale.saleNumber}`);
      }

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
            const prepaidResult = await this.consumeSpecificPrepaid(updateSaleDto.prepaidId, existingSale.subtotal);
            updateData.prepaidUsed = prepaidResult.consumed;
          } catch (prepaidError) {
            if (prepaidError instanceof PrepaidInsuficienteException || 
                prepaidError instanceof PrepaidNoEncontradoException ||
                prepaidError instanceof PrepaidYaConsumidoException) {
              throw prepaidError;
            }
            throw new BadRequestException('Error al consumir el prepaid especificado');
          }
        } else if (updateSaleDto.prepaidId === null || updateSaleDto.prepaidId === '') {
          // Si se elimina el prepaidId, quitar prepaidUsed
          updateData.prepaidUsed = 0;
        }
      }

      // Si se actualiza prepaidUsed directamente
      if (updateSaleDto.prepaidUsed !== undefined) {
        updateData.prepaidUsed = updateSaleDto.prepaidUsed;
      }

      // Si se actualizan porcentajes de tax o discount
      if (updateSaleDto.tax !== undefined) {
        updateData.tax = updateSaleDto.tax;
      }
      if (updateSaleDto.discount !== undefined) {
        updateData.discount = updateSaleDto.discount;
      }

      // Si se actualizan los items, procesarlos
      if (updateSaleDto.items) {
        // Restaurar stock de items anteriores
        await this.updateProductStock(existingSale.items, 'add');

        // Procesar nuevos items
        const processedItems = await this.validateAndProcessItems(updateSaleDto.items);
        
        // Actualizar stock con nuevos items
        await this.updateProductStock(processedItems, 'subtract');

        // Calcular nuevo subtotal
        const subtotal = processedItems.reduce((sum, item) => sum + item.subtotal, 0);

        updateData = {
          ...updateData,
          items: processedItems,
          subtotal,
        };
      }

      // Recalcular total si cambió algún valor que lo afecte
      const needsRecalculation = updateSaleDto.items || updateSaleDto.tax !== undefined || 
                                updateSaleDto.discount !== undefined || updateSaleDto.prepaidUsed !== undefined;

      if (needsRecalculation) {
        const currentSubtotal = updateData.subtotal || existingSale.subtotal;
        const currentTaxPercent = updateData.tax !== undefined ? updateData.tax : existingSale.tax;
        const currentDiscountPercent = updateData.discount !== undefined ? updateData.discount : existingSale.discount;
        const currentPrepaidUsed = updateData.prepaidUsed !== undefined ? updateData.prepaidUsed : existingSale.prepaidUsed;

        // Validar que prepaidUsed no sea mayor al total
        this.validatePrepaidUsed(currentPrepaidUsed, currentSubtotal, currentTaxPercent, currentDiscountPercent);

        // Calcular nuevo total
        const totals = this.calculateTotal(currentSubtotal, currentTaxPercent, currentDiscountPercent, currentPrepaidUsed);
        updateData.total = totals.total;
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

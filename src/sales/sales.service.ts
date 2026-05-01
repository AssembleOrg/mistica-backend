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
  PrepaidYaConsumidoException,
  CajaNoAbiertaException,
} from '../common/exceptions';
import { SaleDocument, ProductDocument, ClientDocument } from '../common/schemas';
import { PaymentMethod, PrepaidStatus, SaleStatus } from '../common/enums';
import { PrepaidsService } from '../prepaids/prepaids.service';
import { CashboxService } from '../cashbox/cashbox.service';
import { buildDateFilter } from '../common/utils';

@Injectable()
export class SalesService {
  constructor(
    @InjectModel('Sale') private readonly saleModel: Model<SaleDocument>,
    @InjectModel('Product') private readonly productModel: Model<ProductDocument>,
    @InjectModel('Client') private readonly clientModel: Model<ClientDocument>,
    private readonly prepaidsService: PrepaidsService,
    private readonly cashboxService: CashboxService,
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
      payments: (saleObj.payments || []).map((p) => ({
        method: p.method,
        amount: p.amount,
        receivedAmount: p.receivedAmount,
        changeGiven: p.changeGiven,
      })),
      status: saleObj.status,
      notes: saleObj.notes,
      afipCae: saleObj.afipCae,
      afipNumero: saleObj.afipNumero,
      afipFechaVto: saleObj.afipFechaVto,
      createdAt: saleObj.createdAt,
      updatedAt: saleObj.updatedAt,
      deletedAt: saleObj.deletedAt,
    };
  }

  /**
   * Valida `payments[]` contra `total`:
   *  - Suma de amounts = total (aceptamos ±0.01 de redondeo).
   *  - Una sola entrada por método (si pasan dos CASH, error: deben sumar a uno).
   *  - Sólo CASH puede traer `receivedAmount > amount`. La diferencia se
   *    devuelve como vuelto y se persiste en `changeGiven`.
   *  - Para no-CASH, `receivedAmount` se ignora.
   * Devuelve el array normalizado listo para guardar.
   */
  private buildSalePayments(
    payments: Array<{
      method: PaymentMethod;
      amount: number;
      receivedAmount?: number;
    }>,
    total: number,
  ): Array<{
    method: PaymentMethod;
    amount: number;
    receivedAmount?: number;
    changeGiven?: number;
  }> {
    if (!payments || payments.length === 0) {
      throw new BadRequestException('La venta debe tener al menos un pago');
    }

    const seen = new Set<PaymentMethod>();
    const normalized = payments.map((p) => {
      if (seen.has(p.method)) {
        throw new BadRequestException(
          `Hay más de un pago con el mismo método (${p.method}). Combinálos en uno solo.`,
        );
      }
      seen.add(p.method);

      if (p.amount <= 0) {
        throw new BadRequestException(
          `El monto del pago en ${p.method} debe ser mayor a 0`,
        );
      }

      if (p.method === PaymentMethod.CASH) {
        const received = p.receivedAmount ?? p.amount;
        if (received < p.amount) {
          throw new BadRequestException(
            `El efectivo recibido (${received}) no puede ser menor al monto a cobrar (${p.amount})`,
          );
        }
        const change = Number((received - p.amount).toFixed(2));
        return {
          method: p.method,
          amount: p.amount,
          receivedAmount: received,
          changeGiven: change,
        };
      }

      // Para no-CASH ignoramos receivedAmount/changeGiven
      return { method: p.method, amount: p.amount };
    });

    const sum = normalized.reduce((acc, p) => acc + p.amount, 0);
    if (Math.abs(sum - total) > 0.01) {
      throw new BadRequestException(
        `La suma de los pagos (${sum.toFixed(2)}) no coincide con el total (${total.toFixed(2)}).`,
      );
    }

    return normalized;
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

  /**
   * Genera una factura electrónica tipo C en AFIP
   */
  private async generateAfipInvoice(sale: Sale): Promise<{ cae: string; numeroComprobante: number; caeFchVto: string } | null> {
    try {
      // Obtener configuración AFIP desde variables de entorno
      const afipApiUrl = process.env.AFIP_API_URL || 'https://api.afip-hub.com/api';
      const certificateApiUrl = process.env.AFIP_CERTIFICATE_API_URL || 'https://afip-facturacion-production.up.railway.app/api';
      const certificateId = process.env.AFIP_CERTIFICATE_ID || '154';
      const cuitEmisor = process.env.AFIP_CUIT || '';
      const puntoVenta = parseInt(process.env.AFIP_PUNTO_VENTA || '1', 10);

      if (!cuitEmisor || !certificateId) {
        console.warn('⚠️ Configuración AFIP incompleta. No se generará factura.');
        return null;
      }

      // 1. Obtener certificado y clave privada desde el endpoint
      console.log('📄 Obteniendo certificado desde endpoint...');
      const certificateResponse = await fetch(`${certificateApiUrl}/get-certificate/${certificateId}`);
      if (!certificateResponse.ok) {
        throw new Error(`Error al obtener certificado: ${certificateResponse.statusText}`);
      }
      const certificateData = await certificateResponse.json();
      const { cert: certificado, key: clavePrivada } = certificateData;

      // 2. Consultar último comprobante autorizado
      console.log('📄 Consultando último comprobante autorizado...');
      const ultimoAutorizadoResponse = await fetch(`${afipApiUrl}/afip/ultimo-autorizado`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          puntoVenta,
          tipoComprobante: 11, // Factura C
          cuitEmisor,
          certificado,
          clavePrivada,
        }),
      });

      if (!ultimoAutorizadoResponse.ok) {
        throw new Error(`Error al consultar último comprobante: ${ultimoAutorizadoResponse.statusText}`);
      }

      const ultimoAutorizadoData = await ultimoAutorizadoResponse.json();
      if (!ultimoAutorizadoData.success) {
        throw new Error(ultimoAutorizadoData.message || 'Error al consultar último comprobante');
      }

      const proximoNumero = ultimoAutorizadoData.data.proximoNumero;

      // 3. Formatear fecha (YYYYMMDD)
      const fecha = DateTime.now().setZone('America/Argentina/Buenos_Aires');
      const fechaComprobante = fecha.toFormat('yyyyMMdd');

      // 4. Calcular importes para factura C (consumidor final, no discrimina IVA)
      const importeNetoGravado = sale.subtotal;
      const importeIva = 0; // Factura C no discrimina IVA
      const importeTotal = sale.total;

      // 5. Crear factura
      console.log('📄 Generando factura tipo C en AFIP...');
      const invoiceResponse = await fetch(`${afipApiUrl}/afip/invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          puntoVenta,
          tipoComprobante: 11, // Factura C
          numeroComprobante: proximoNumero,
          fechaComprobante,
          cuitCliente: '0', // Consumidor final
          tipoDocumento: 99, // Consumidor final
          importeNetoGravado,
          importeIva,
          importeTotal,
          concepto: 1, // Productos
          monedaId: 'PES',
          cotizacionMoneda: 1,
          cuitEmisor,
          certificado,
          clavePrivada,
        }),
      });

      if (!invoiceResponse.ok) {
        throw new Error(`Error al crear factura: ${invoiceResponse.statusText}`);
      }

      const invoiceData = await invoiceResponse.json();
      if (!invoiceData.success) {
        throw new Error(invoiceData.message || 'Error al crear factura');
      }

      if (invoiceData.data.resultado === 'A') {
        console.log('✅ Factura AFIP aprobada:', {
          cae: invoiceData.data.cae,
          numero: invoiceData.data.numeroComprobante,
          vto: invoiceData.data.caeFchVto,
        });
        return {
          cae: invoiceData.data.cae,
          numeroComprobante: invoiceData.data.numeroComprobante,
          caeFchVto: invoiceData.data.caeFchVto,
        };
      } else {
        const observaciones = invoiceData.data.observaciones || invoiceData.data.observacionesDetalladas || [];
        const mensajeObservaciones = Array.isArray(observaciones) 
          ? observaciones.map((obs: any) => typeof obs === 'string' ? obs : obs.msg || obs.code).join(', ')
          : 'Factura rechazada por AFIP';
        throw new BadRequestException(`La factura fue rechazada por AFIP: ${mensajeObservaciones}`);
      }
    } catch (error) {
      console.error('Error al generar factura AFIP:', error);
      // Re-lanzar el error para que se propague y no se complete la venta
      throw error;
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
      // Bloqueo: no se puede vender sin caja abierta.
      const openSession = await this.cashboxService.findOpenSession();
      if (!openSession) {
        throw new CajaNoAbiertaException();
      }

      // Validar que el cliente existe solo si se proporciona clientId
      let client: ClientDocument | null = null;
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
      }

      // Validar que prepaidUsed no sea mayor al total
      this.validatePrepaidUsed(prepaidUsed, subtotal, taxPercent, discountPercent);

      // Calcular totales finales
      const totals = this.calculateTotal(subtotal, taxPercent, discountPercent, prepaidUsed);

      // Validar payments contra el total (1 entrada por método; suma === total;
      // vuelto sólo en CASH).
      const payments = this.buildSalePayments(createSaleDto.payments, totals.total);

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
        payments,
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
          error instanceof CajaNoAbiertaException ||
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

        // Si cambió el total, los pagos vigentes ya no cuadran. Exigimos que
        // el caller reenvíe `payments` con la nueva distribución.
        if (totals.total !== existingSale.total && !updateSaleDto.payments) {
          throw new BadRequestException(
            'Cambió el total de la venta. Reenvía `payments` con la nueva distribución por método de pago.',
          );
        }
      }

      // Si se envían payments (sea por re-cálculo o explícito), validamos.
      if (updateSaleDto.payments) {
        const totalForPayments = updateData.total ?? existingSale.total;
        updateData.payments = this.buildSalePayments(updateSaleDto.payments, totalForPayments);
      }

      // Normalizar email si se proporciona
      if (updateSaleDto.customerEmail) {
        updateData.customerEmail = updateSaleDto.customerEmail.toLowerCase();
      }

      // Manejar facturación AFIP si se solicita al completar la venta
      // IMPORTANTE: Si shouldInvoice es true, la facturación DEBE ser exitosa para completar la venta
      if (updateSaleDto.shouldInvoice && updateSaleDto.status === SaleStatus.COMPLETED) {
        try {
          const invoiceData = await this.generateAfipInvoice(existingSale);
          if (!invoiceData) {
            throw new BadRequestException('No se pudo generar la factura electrónica. La venta no se completará.');
          }
          // Si la factura se generó exitosamente, guardar los datos en la venta
          updateData.afipCae = invoiceData.cae;
          updateData.afipNumero = invoiceData.numeroComprobante;
          updateData.afipFechaVto = invoiceData.caeFchVto;
          
          console.log('💾 Guardando datos de factura AFIP en la venta:', {
            saleNumber: existingSale.saleNumber,
            afipCae: invoiceData.cae,
            afipNumero: invoiceData.numeroComprobante,
            afipFechaVto: invoiceData.caeFchVto,
          });
        } catch (error) { 
          // Si falla la facturación y shouldInvoice es true, NO completar la venta
          console.error('Error al generar factura AFIP:', error);
          if (error instanceof BadRequestException) {
            throw error; // Re-lanzar BadRequestException tal cual
          }
          // Para otros errores, crear un BadRequestException con el mensaje del error
          const errorMessage = error instanceof Error ? error.message : 'Error desconocido al generar factura';
          throw new BadRequestException(`Error al generar factura electrónica: ${errorMessage}. La venta no se completará.`);
        }
      }

      const sale = await this.saleModel.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      ).exec();

      if (!sale) {
        throw new VentaNoEncontradaException(id);
      }

      // Log para confirmar que los datos de AFIP se guardaron
      if (updateData.afipCae) {
        console.log('✅ Datos de factura AFIP guardados exitosamente en la venta:', {
          saleNumber: sale.saleNumber,
          afipCae: sale.afipCae,
          afipNumero: sale.afipNumero,
          afipFechaVto: sale.afipFechaVto,
        });
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

      // Calcular resumen: cada `payment.amount` se acumula al método correspondiente.
      const summary: DailySalesSummary = {
        totalSales: sales.length,
        totalAmount: sales.reduce((sum, sale) => sum + sale.total, 0),
        totalByPaymentMethod: {
          [PaymentMethod.CASH]: 0,
          [PaymentMethod.CARD]: 0,
          [PaymentMethod.TRANSFER]: 0,
        },
        totalCashChange: 0,
        totalByStatus: {
          [SaleStatus.PENDING]: 0,
          [SaleStatus.COMPLETED]: 0,
          [SaleStatus.CANCELLED]: 0,
        },
      };

      for (const sale of sales) {
        for (const p of sale.payments || []) {
          summary.totalByPaymentMethod[p.method] =
            (summary.totalByPaymentMethod[p.method] ?? 0) + p.amount;
          if (p.method === PaymentMethod.CASH && p.changeGiven) {
            summary.totalCashChange += p.changeGiven;
          }
        }
        summary.totalByStatus[sale.status] += 1;
      }

      return {
        date: targetDate.toISODate() || '',
        timezone,
        sales: sales.map((sale) => ({
          id: sale._id?.toString() || '',
          saleNumber: sale.saleNumber,
          customerName: sale.customerName,
          total: sale.total,
          payments: (sale.payments || []).map((p) => ({
            method: p.method,
            amount: p.amount,
            receivedAmount: p.receivedAmount,
            changeGiven: p.changeGiven,
          })),
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

import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DateTime } from 'luxon';
import { CreateSaleDto, UpdateSaleDto, SalesPaginatedFilterDto, DailySalesQueryDto, AddSalePaymentsDto } from '../common/dto';
import { Sale, SaleItem, DailySalesResponse, DailySalesSummary, PaginatedResponse, RelatedSaleSummary } from '../common/interfaces';
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
import { SaleDocument, ProductDocument, ClientDocument, PrepaidDocument } from '../common/schemas';
import { InvoiceType, PaymentMethod, PaymentMethodFilter, PrepaidStatus, ProductKind, SaleStatus, TaxCondition } from '../common/enums';
import { PrepaidsService } from '../prepaids/prepaids.service';
import { CashboxService } from '../cashbox/cashbox.service';
import { buildDateFilter } from '../common/utils';

@Injectable()
export class SalesService {
  constructor(
    @InjectModel('Sale') private readonly saleModel: Model<SaleDocument>,
    @InjectModel('Product') private readonly productModel: Model<ProductDocument>,
    @InjectModel('Client') private readonly clientModel: Model<ClientDocument>,
    @InjectModel('Prepaid') private readonly prepaidModel: Model<PrepaidDocument>,
    private readonly prepaidsService: PrepaidsService,
    private readonly cashboxService: CashboxService,
  ) {}

  private mapToSaleResponse(sale: SaleDocument, relatedSales?: RelatedSaleSummary[]): Sale {
    const saleObj = sale.toObject();
    return {
      id: saleObj._id.toString(),
      relatedSaleIds: (saleObj.relatedSaleIds || []).map((x: any) => x.toString()),
      relatedSales,
      saleNumber: saleObj.saleNumber,
      name: saleObj.name,
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
        bonifiedQty: item.bonifiedQty ?? 0,
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
        // Pagos viejos (pre-migración) podrían no tener createdAt — fallback a
        // la fecha de la venta, que era el comportamiento implícito antes.
        createdAt: p.createdAt ?? saleObj.createdAt,
      })),
      status: saleObj.status,
      balanceDue: saleObj.balanceDue ?? 0,
      settledLines: (saleObj.settledLines || []).map((l: any) => ({
        saleId: l.saleId?.toString(),
        saleNumber: l.saleNumber,
        saleName: l.saleName,
        amount: l.amount,
      })),
      notes: saleObj.notes,
      seller: saleObj.seller,
      afipCae: saleObj.afipCae,
      afipNumero: saleObj.afipNumero,
      afipFechaVto: saleObj.afipFechaVto,
      createdAt: saleObj.createdAt,
      updatedAt: saleObj.updatedAt,
      deletedAt: saleObj.deletedAt,
    };
  }

  /**
   * Normaliza `payments[]`:
   *  - Una sola entrada por método (si pasan dos CASH, error: deben sumar a uno).
   *  - Cada pago lleva su propio `createdAt` (default = `now`), así pagos
   *    agregados después (completando un PARTIAL) cuentan para la caja del día
   *    en que entraron, no la del día original de la venta.
   * NO valida `Σ amounts === total`: esa decisión es contextual (venta normal
   * exige igualdad o aplica auto-descuento; PARTIAL acepta Σ < total) y vive
   * en quien llama (`create`, `addPayments`).
   */
  private buildSalePayments(
    payments: Array<{
      method: PaymentMethod;
      amount: number;
    }>,
    when: Date = new Date(),
  ): Array<{
    method: PaymentMethod;
    amount: number;
    createdAt: Date;
  }> {
    if (!payments || payments.length === 0) {
      throw new BadRequestException('La venta debe tener al menos un pago');
    }

    const seen = new Set<PaymentMethod>();
    return payments.map((p) => {
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

      return { method: p.method, amount: p.amount, createdAt: when };
    });
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

    for (const item of items) {
      // Verificar que el producto existe
      const product = await this.productModel.findOne({
        _id: item.productId,
        deletedAt: { $exists: false }
      }).exec();

      if (!product) {
        throw new ProductoNoEncontradoEnVentaException(item.productId);
      }

      // PREPAID y SERVICE son virtuales: no tienen stock, así que no se chequea.
      // El stock sólo se valida para productos físicos (STANDARD).
      const skipsStock = product.kind === ProductKind.PREPAID || product.kind === ProductKind.SERVICE;
      if (!skipsStock && product.stock < item.quantity) {
        throw new StockInsuficienteEnVentaException(product.name, product.stock, item.quantity);
      }

      // Cantidad bonificada: sale del depo igual (stock se descuenta por la
      // qty completa), pero no se cobra. Subtotal = (qty − bonif) × precio.
      const bonifiedQty = Math.max(0, item.bonifiedQty ?? 0);
      if (bonifiedQty > item.quantity) {
        throw new BadRequestException(
          `La cantidad bonificada (${bonifiedQty}) no puede ser mayor a la cantidad (${item.quantity}) en "${product.name}".`,
        );
      }
      const itemSubtotal = (item.quantity - bonifiedQty) * item.unitPrice;

      processedItems.push({
        productId: item.productId,
        productName: product.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: itemSubtotal,
        bonifiedQty,
      });
    }

    return processedItems;
  }

  // Devuelve los IDs de productos cuya kind === PREPAID. Se usa para detectar
  // qué líneas deben generar una seña al confirmar la venta.
  private async getPrepaidProductIds(productIds: string[]): Promise<Set<string>> {
    if (productIds.length === 0) return new Set();
    const prepaidProducts = await this.productModel
      .find({ _id: { $in: productIds }, kind: ProductKind.PREPAID })
      .select('_id')
      .exec();
    return new Set(prepaidProducts.map((p) => String(p._id)));
  }

  // IDs de productos "stockless" (PREPAID + SERVICE). Para estos no se descuenta
  // ni se restaura stock al crear/cancelar ventas.
  private async getStocklessProductIds(productIds: string[]): Promise<Set<string>> {
    if (productIds.length === 0) return new Set();
    const stockless = await this.productModel
      .find({
        _id: { $in: productIds },
        kind: { $in: [ProductKind.PREPAID, ProductKind.SERVICE] },
      })
      .select('_id')
      .exec();
    return new Set(stockless.map((p) => String(p._id)));
  }

  private async updateProductStock(items: SaleItem[], operation: 'add' | 'subtract'): Promise<void> {
    const stocklessIds = await this.getStocklessProductIds(items.map((i) => i.productId.toString()));
    for (const item of items) {
      // Las líneas PREPAID y SERVICE no tocan stock.
      if (stocklessIds.has(item.productId.toString())) continue;

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

  // `discountFlat` es ahora un MONTO FIJO en pesos. Positivo = descuento
  // (reduce el total), negativo = recargo (lo aumenta). `taxPercent` se
  // mantiene como porcentaje del subtotal.
  private calculateTotal(subtotal: number, taxPercent: number = 0, discountFlat: number = 0, prepaidUsed: number = 0): {
    taxAmount: number;
    discountAmount: number;
    total: number;
  } {
    const taxAmount = (subtotal * taxPercent) / 100;
    const discountAmount = discountFlat;
    const total = subtotal + taxAmount - discountAmount - prepaidUsed;

    return {
      taxAmount,
      discountAmount,
      total: Math.max(0, total),
    };
  }

  private validatePrepaidUsed(prepaidUsed: number, subtotal: number, taxPercent: number = 0, discountFlat: number = 0): void {
    const maxTotal = subtotal + (subtotal * taxPercent / 100) - discountFlat;
    if (prepaidUsed > maxTotal) {
      throw new BadRequestException(`El monto de prepaid usado (${prepaidUsed}) no puede ser mayor al total de la venta (${maxTotal})`);
    }
  }

  // Mapas AFIP. Se mantienen privados acá porque solo se usan dentro de
  // generateAfipInvoice / lookupAfipContributor.
  private static readonly INVOICE_TYPE_TO_AFIP: Record<InvoiceType, number> = {
    [InvoiceType.A]: 1,
    [InvoiceType.B]: 6,
    [InvoiceType.C]: 11,
  };

  private static readonly TAX_CONDITION_TO_AFIP: Record<TaxCondition, number> = {
    [TaxCondition.RESPONSABLE_INSCRIPTO]: 1,
    [TaxCondition.EXENTO]: 4,
    [TaxCondition.CONSUMIDOR_FINAL]: 5,
    [TaxCondition.MONOTRIBUTISTA]: 6,
  };

  // AFIP devuelve 1=RI, 4=Exento, 5=CF, 6=Monotributista
  private static readonly AFIP_TO_TAX_CONDITION: Record<number, TaxCondition> = {
    1: TaxCondition.RESPONSABLE_INSCRIPTO,
    4: TaxCondition.EXENTO,
    5: TaxCondition.CONSUMIDOR_FINAL,
    6: TaxCondition.MONOTRIBUTISTA,
  };

  /**
   * Consulta el padrón de AFIP por CUIT y devuelve los datos del contribuyente
   * (denominación, condición fiscal, domicilio).
   */
  async lookupAfipContributor(cuit: string): Promise<{
    cuit: string;
    businessName: string;
    taxCondition: TaxCondition | null;
    afipTaxConditionLabel: string | null;
    fiscalAddress: string;
    estado: string | null;
  }> {
    const cuitLimpio = (cuit || '').replace(/\D/g, '');
    if (cuitLimpio.length !== 11) {
      throw new BadRequestException('El CUIT debe tener 11 dígitos');
    }

    const afipApiUrl = process.env.AFIP_API_URL || 'https://api.afip-hub.com/api';
    const certificateApiUrl = process.env.AFIP_CERTIFICATE_API_URL || 'https://afip-facturacion-production.up.railway.app/api';
    const certificateId = process.env.AFIP_CERTIFICATE_ID || '154';
    const cuitEmisor = process.env.AFIP_CUIT || '';

    if (!cuitEmisor || !certificateId) {
      throw new BadRequestException('Configuración AFIP incompleta');
    }

    const certificateResponse = await fetch(`${certificateApiUrl}/get-certificate/${certificateId}`);
    if (!certificateResponse.ok) {
      throw new BadRequestException(`Error al obtener certificado: ${certificateResponse.statusText}`);
    }
    const { cert: certificado, key: clavePrivada } = await certificateResponse.json();

    const res = await fetch(`${afipApiUrl}/afip/consultar-contribuyente`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cuit: cuitLimpio,
        cuitEmisor,
        certificado,
        clavePrivada,
      }),
    });

    const text = await res.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { /* noop */ }

    if (!res.ok) {
      console.error('❌ AFIP /afip/consultar-contribuyente:', res.status, text);
      throw new BadRequestException(parsed?.message || `AFIP rechazó la consulta de contribuyente (HTTP ${res.status})`);
    }

    const data = parsed?.data;
    if (!data) {
      throw new BadRequestException('AFIP respondió sin datos del contribuyente');
    }

    // Compone "direccion, localidad, provincia (CP)" sin partes vacías
    const dom = data.domicilio || {};
    const fiscalAddress = [
      dom.direccion,
      dom.localidad,
      [dom.descripcionProvincia, dom.codPostal ? `(${dom.codPostal})` : ''].filter(Boolean).join(' '),
    ].filter(Boolean).join(', ');

    return {
      cuit: data.cuit || cuitLimpio,
      businessName: data.denominacion || '',
      taxCondition: data.condicionIvaCodigo ? SalesService.AFIP_TO_TAX_CONDITION[data.condicionIvaCodigo] || null : null,
      afipTaxConditionLabel: data.condicionIva || null,
      fiscalAddress,
      estado: data.estado || null,
    };
  }

  /**
   * Genera una factura electrónica en AFIP. Por default Factura C
   * consumidor final; recibe options para emitir A/B con CUIT del receptor.
   */
  private async generateAfipInvoice(
    sale: Sale,
    options?: { invoiceType?: InvoiceType; cuit?: string; taxCondition?: TaxCondition },
  ): Promise<{ cae: string; numeroComprobante: number; caeFchVto: string } | null> {
    try {
      const afipApiUrl = process.env.AFIP_API_URL || 'https://api.afip-hub.com/api';
      const certificateApiUrl = process.env.AFIP_CERTIFICATE_API_URL || 'https://afip-facturacion-production.up.railway.app/api';
      const certificateId = process.env.AFIP_CERTIFICATE_ID || '154';
      const cuitEmisor = process.env.AFIP_CUIT || '';
      const puntoVenta = parseInt(process.env.AFIP_PUNTO_VENTA || '1', 10);

      if (!cuitEmisor || !certificateId) {
        console.warn('⚠️ Configuración AFIP incompleta. No se generará factura.');
        return null;
      }

      // Default: Factura C consumidor final no identificado.
      const invoiceType = options?.invoiceType ?? InvoiceType.C;
      const tipoComprobante = SalesService.INVOICE_TYPE_TO_AFIP[invoiceType];

      // CUIT del receptor: si vino y es válido (11 dígitos) lo usamos como CUIT,
      // sino consumidor final sin identificar.
      const cuitClienteLimpio = (options?.cuit || '').replace(/\D/g, '');
      const hasValidCuit = cuitClienteLimpio.length === 11;
      const cuitCliente = hasValidCuit ? cuitClienteLimpio : '0';
      const tipoDocumento = hasValidCuit ? 80 /* CUIT */ : 99 /* Consumidor Final */;

      // Condición IVA del receptor: si no la pasaron, asumir CF.
      const taxCondition = options?.taxCondition ?? TaxCondition.CONSUMIDOR_FINAL;
      const condicionIvaReceptor = SalesService.TAX_CONDITION_TO_AFIP[taxCondition];

      // 1. Obtener certificado y clave privada desde el endpoint
      console.log('📄 Obteniendo certificado desde endpoint...');
      const certificateResponse = await fetch(`${certificateApiUrl}/get-certificate/${certificateId}`);
      if (!certificateResponse.ok) {
        throw new Error(`Error al obtener certificado: ${certificateResponse.statusText}`);
      }
      const certificateData = await certificateResponse.json();
      const { cert: certificado, key: clavePrivada } = certificateData;

      // 2. Consultar último comprobante autorizado del tipo elegido
      console.log(`📄 Consultando último autorizado tipo ${tipoComprobante}...`);
      const ultimoAutorizadoResponse = await fetch(`${afipApiUrl}/afip/ultimo-autorizado`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          puntoVenta,
          tipoComprobante,
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

      // 4. Importes. AFIP exige `ImpTotal == ImpNeto + ImpTrib + ImpIva`.
      // Para Facturas C (consumidor final) no se discrimina IVA, así que
      // ImpNeto == ImpTotal == sale.total. Para A/B, mantenemos misma lógica
      // (no discriminamos IVA en este flujo); si hace falta desglose, se hace
      // por línea como en hueso.
      const importeTotal = sale.total;
      const importeNetoGravado = sale.total;
      const importeIva = 0;

      console.log(`📄 Generando factura tipo ${invoiceType} (${tipoComprobante}) en AFIP...`);
      const invoicePayload = {
        puntoVenta,
        tipoComprobante,
        numeroComprobante: proximoNumero,
        fechaComprobante,
        cuitCliente,
        tipoDocumento,
        condicionIvaReceptor,
        importeNetoGravado,
        importeIva,
        importeTotal,
        concepto: 1,
        monedaId: 'PES',
        cotizacionMoneda: 1,
        cuitEmisor,
        certificado,
        clavePrivada,
      };
      console.log('📄 Payload a AFIP:', {
        ...invoicePayload,
        certificado: '<redacted>',
        clavePrivada: '<redacted>',
      });

      const invoiceResponse = await fetch(`${afipApiUrl}/afip/invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invoicePayload),
      });

      if (!invoiceResponse.ok) {
        // Capturamos el body de la respuesta para ver qué rechazó AFIP.
        // Antes solo se logueaba statusText ("Bad Request"), inservible.
        let bodyText = '';
        try {
          bodyText = await invoiceResponse.text();
        } catch {
          /* noop */
        }
        console.error('❌ AFIP /afip/invoice falló:', {
          status: invoiceResponse.status,
          statusText: invoiceResponse.statusText,
          body: bodyText,
        });
        throw new Error(
          `Error al crear factura (HTTP ${invoiceResponse.status} ${invoiceResponse.statusText})${bodyText ? `: ${bodyText}` : ''}`,
        );
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

  /**
   * Reescala los renglones de una venta para que sus subtotales sumen `target`
   * (pago parcial / precio libre). Reparte proporcional al subtotal original; el
   * último renglón absorbe el redondeo. Recalcula unitPrice y limpia bonifiedQty
   * (en precio libre no aplica). Así el recibo queda coherente con el total
   * cobrado, sin mostrar el precio de lista.
   */
  private rescaleItemsToTotal(items: SaleItem[], target: number): SaleItem[] {
    const itemsSum = items.reduce((acc, it) => acc + (it.subtotal || 0), 0);
    const n = items.length;
    let allocated = 0;
    return items.map((it, idx) => {
      const isLast = idx === n - 1;
      let share: number;
      if (isLast) {
        share = Number((target - allocated).toFixed(2));
      } else {
        share =
          itemsSum > 0
            ? Number(((it.subtotal / itemsSum) * target).toFixed(2))
            : Number((target / n).toFixed(2));
        allocated = Number((allocated + share).toFixed(2));
      }
      const qty = it.quantity || 1;
      return {
        ...it,
        subtotal: share,
        unitPrice: Number((share / qty).toFixed(2)),
        bonifiedQty: 0,
      };
    });
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

      // Validar y procesar items (puede venir vacío: venta sin productos).
      const processedItems = await this.validateAndProcessItems(createSaleDto.items ?? []);

      // Ventas viejas cuyo saldo se cobra DENTRO de esta venta nueva. Se cargan
      // y validan acá; el monto a saldar se suma al total como recargo (no toca
      // stock) y las ventas viejas se saldan más abajo (sin sumarles pago).
      const settlements = await this.loadSettleableSales(
        createSaleDto.settlements ?? [],
        createSaleDto.clientId,
        createSaleDto.isPartial === true,
      );
      const settledAmount = Number(
        settlements.reduce((acc, x) => acc + x.amount, 0).toFixed(2),
      );

      // Generar número de venta único
      const saleNumber = await this.generateSaleNumber();

      // Calcular totales. Cuando NO hay productos, el subtotal lo define la
      // suma de los pagos ("monto a cobrar") — se reasigna más abajo.
      let subtotal = processedItems.reduce((sum, item) => sum + item.subtotal, 0);
      const taxPercent = createSaleDto.tax || 0;
      // El descuento es sólo el del usuario. El cobro de saldo de ventas
      // anteriores (settledAmount) NO se pliega acá: se suma aparte al total y
      // se guarda como `settledLines` para mostrarlo como una línea propia
      // ("Saldo pendiente V-XXX") en el modal y el ticket.
      const discountFlat = createSaleDto.discount || 0;
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
      this.validatePrepaidUsed(prepaidUsed, subtotal, taxPercent, discountFlat);

      // Calcular totales finales
      const totals = this.calculateTotal(subtotal, taxPercent, discountFlat, prepaidUsed);

      const paymentsSum = (createSaleDto.payments || []).reduce(
        (acc, p) => acc + (p.amount || 0),
        0,
      );
      let finalDiscount = discountFlat;
      let finalTotal = totals.total;
      const isPartial = createSaleDto.isPartial === true;
      let saleStatus: SaleStatus = SaleStatus.PENDING;
      let balanceDue = 0;

      if (isPartial) {
        if (paymentsSum <= 0) {
          throw new BadRequestException('Una venta con pago parcial requiere al menos un pago > 0.');
        }
        if (processedItems.length > 0) {
          // Seña real: hay items con precio de lista. El total es el precio real,
          // balanceDue = lo que falta abonar. Los items se guardan sin rescalar.
          // finalTotal ya viene de totals.total (precio de lista calculado arriba).
          finalDiscount = 0;
          prepaidUsed = 0;
          balanceDue = Number(Math.max(0, finalTotal - paymentsSum).toFixed(2));
        } else {
          // Sin items: modo precio libre (el operador tipea lo que cobra ahora).
          finalTotal = Number(paymentsSum.toFixed(2));
          subtotal = finalTotal;
          finalDiscount = 0;
          prepaidUsed = 0;
          balanceDue = 0;
        }
      } else if (processedItems.length === 0) {
        // Venta sin productos (no PARTIAL): el total ES el monto pagado. Ese
        // monto puede incluir el cobro de saldos anteriores (settledAmount); el
        // subtotal de productos es lo que sobra (paymentsSum − settledAmount),
        // así el saldo se muestra como su propia línea y no infla el subtotal.
        if (paymentsSum <= 0) {
          throw new BadRequestException(
            'Una venta sin productos requiere un monto a cobrar mayor a 0.',
          );
        }
        subtotal = Number(Math.max(0, paymentsSum - settledAmount).toFixed(2));
        finalTotal = paymentsSum;
        finalDiscount = 0;
      }

      // El cobro de saldo de ventas anteriores suma al total (no es producto ni
      // descuento; se muestra como línea propia). En venta sin productos ya
      // quedó incluido (finalTotal = paymentsSum).
      if (!isPartial && processedItems.length > 0 && settledAmount > 0) {
        finalTotal = Number((finalTotal + settledAmount).toFixed(2));
      }

      // Ajuste automático (sólo ventas NO PARCIALES): la venta se salda con lo
      // efectivamente cobrado. Si Σ pagos difiere del total de lista, el total
      // pasa a ser lo cobrado y la diferencia se registra como ajuste con signo
      // (positivo = descuento si se cobró de menos; negativo = recargo si se
      // cobró de más). Antes el sobre-cobro se bloqueaba; ahora se permite.
      // En PARTIAL la diferencia es saldo pendiente, no ajuste.
      if (!isPartial) {
        const autoAdjust = Number((finalTotal - paymentsSum).toFixed(2));
        if (Math.abs(autoAdjust) > 0.01) {
          finalDiscount = Number((finalDiscount + autoAdjust).toFixed(2));
          finalTotal = Number(paymentsSum.toFixed(2));
        }
      }

      // Normalizar pagos: 1 entrada por método, amount > 0, createdAt = now.
      const payments = this.buildSalePayments(createSaleDto.payments);

      // Si hay saldo pendiente la venta nace PARTIAL (no PENDING).
      if (balanceDue > 0.01) {
        saleStatus = SaleStatus.PARTIAL;
      }

      // Nunca rescalar items: en seña real se guardan al precio de lista;
      // en precio libre (sin items) no hay items que rescalar.
      const itemsForSale = processedItems;

      // Crear la venta
      const sale = await this.saleModel.create({
        saleNumber,
        name: createSaleDto.name?.trim() || undefined,
        clientId: createSaleDto.clientId,
        customerName: createSaleDto.customerName,
        customerEmail: createSaleDto.customerEmail?.toLowerCase(),
        customerPhone: createSaleDto.customerPhone,
        items: itemsForSale,
        subtotal,
        tax: taxPercent,
        discount: finalDiscount,
        prepaidUsed,
        prepaidId: prepaidId,
        total: finalTotal,
        payments,
        status: saleStatus,
        balanceDue,
        settledLines: settlements.map((x) => ({
          saleId: x.sale._id,
          saleNumber: x.sale.saleNumber,
          saleName: x.sale.name,
          amount: x.amount,
        })),
        notes: createSaleDto.notes,
        seller: createSaleDto.seller,
      });

      if (!sale || !sale._id) {
        throw new BadRequestException('Error al crear la venta');
      }

      // Actualizar stock de productos
      await this.updateProductStock(processedItems, 'subtract');

      // Si la venta incluye líneas de producto PREPAID, generamos una seña
      // (Prepaid PENDING) por línea, asociada al cliente de la venta. Cada
      // línea genera un Prepaid de monto = item.subtotal.
      const prepaidProductIds = await this.getPrepaidProductIds(
        processedItems.map((i) => i.productId.toString()),
      );
      const prepaidLines = processedItems.filter((i) =>
        prepaidProductIds.has(i.productId.toString()),
      );
      if (prepaidLines.length > 0) {
        if (!createSaleDto.clientId) {
          throw new BadRequestException(
            'Las ventas con líneas de seña requieren un cliente asociado',
          );
        }
        const paymentMethod = payments[0]?.method ?? PaymentMethod.CASH;
        const prepaidDocs = prepaidLines.map((line) => ({
          clientId: createSaleDto.clientId,
          amount: line.subtotal,
          paymentMethod,
          status: PrepaidStatus.PENDING,
          notes: `Seña creada con venta ${saleNumber}`,
        }));
        await this.prepaidModel.create(prepaidDocs);
      }

      // Saldar las ventas viejas cuyo saldo se cobró acá y vincularlas (mutuo).
      if (settlements.length > 0) {
        await this.settleTransferredSales(settlements, sale);
        await this.setLinks(
          sale._id.toString(),
          settlements.map((x) => String(x.sale._id)),
        );
        return this.findOne(sale._id.toString());
      }

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
    const { page = 1, limit = 10, search, from, to, status, clientId, paymentMethod, fullSearch } = paginationDto || {};
    const skip = (page - 1) * limit;

    // Construir filtros
    const filters: any = { deletedAt: { $exists: false } };

    // Filtro de búsqueda. Por defecto SOLO por el nombre amigable de la venta
    // (decisión de producto para la tabla global). Con `fullSearch=true` (ej.
    // el modal de historial por cliente) además matchea N° de venta y nombre
    // de producto. Se escapan los metacaracteres de regex para no romper.
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = { $regex: escaped, $options: 'i' };
      if (fullSearch) {
        filters.$or = [
          { name: rx },
          { saleNumber: rx },
          { 'items.productName': rx },
        ];
      } else {
        filters.name = rx;
      }
    }
    
    // Filtro por status
    if (status) {
      filters.status = status;
    }

    // Filtro por clientId
    if (clientId) {
      filters.clientId = clientId;
    }
    
    // Filtro por método de pago
    if (paymentMethod) {
      if (paymentMethod === PaymentMethodFilter.MIXED) {
        filters['payments.1'] = { $exists: true };
      } else {
        filters['payments.method'] = paymentMethod;
      }
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

    return this.mapToSaleResponse(sale, await this.loadRelatedSummaries(sale));
  }

  /**
   * Trae los resúmenes livianos de las ventas relacionadas (vínculo mutuo).
   * Sólo lo usa `findOne` — la lista/paginado no lo necesita (alcanza con el
   * array de ids para mostrar el distintivo). Ignora ventas borradas.
   */
  private async loadRelatedSummaries(
    sale: SaleDocument,
  ): Promise<RelatedSaleSummary[]> {
    const ids = sale.relatedSaleIds || [];
    if (ids.length === 0) return [];
    const related = await this.saleModel
      .find({ _id: { $in: ids }, deletedAt: { $exists: false } })
      .select('saleNumber name total status createdAt')
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    return related.map((r: any) => ({
      id: r._id.toString(),
      saleNumber: r.saleNumber,
      name: r.name,
      total: r.total,
      status: r.status,
      createdAt: r.createdAt,
    }));
  }

  /**
   * Vincula (de forma MUTUA) la venta `id` con el conjunto `relatedSaleIds`.
   * Es sólo informativo: no toca totales ni saldos. Reconcilia ambos lados —
   * agrega esta venta al array de las nuevas relacionadas y se quita de las
   * que se desvincularon. Excluye self y valida que las otras existan.
   */
  async setLinks(id: string, relatedSaleIds: string[] = []): Promise<Sale> {
    const sale = await this.saleModel.findById(id).exec();
    if (!sale || sale.deletedAt) {
      throw new VentaNoEncontradaException(id);
    }

    // Dedup, descartar self y validar existencia (no borradas).
    const requested = [...new Set((relatedSaleIds || []).filter((x) => x && x !== id))];
    const existing = requested.length
      ? await this.saleModel
          .find({ _id: { $in: requested }, deletedAt: { $exists: false } })
          .select('_id')
          .exec()
      : [];
    const validIds = existing.map((d: any) => d._id.toString());

    const oldIds = (sale.relatedSaleIds || []).map((x) => x.toString());
    const added = validIds.filter((x) => !oldIds.includes(x));
    const removed = oldIds.filter((x) => !validIds.includes(x));

    sale.relatedSaleIds = validIds.map((x) => new Types.ObjectId(x));
    await sale.save();

    if (added.length) {
      await this.saleModel.updateMany(
        { _id: { $in: added } },
        { $addToSet: { relatedSaleIds: sale._id } },
      );
    }
    if (removed.length) {
      await this.saleModel.updateMany(
        { _id: { $in: removed } },
        { $pull: { relatedSaleIds: sale._id } },
      );
    }

    return this.findOne(id);
  }

  /**
   * Carga y valida las ventas viejas cuyo saldo (balanceDue) se va a cobrar
   * dentro de una venta nueva. Reglas:
   *  - No se permite combinar con venta nueva parcial (sería ambiguo).
   *  - Cada venta debe existir (no borrada), ser PENDING/PARTIAL y tener
   *    balanceDue > 0.
   *  - Deben pertenecer al mismo cliente que la venta nueva (si ésta tiene
   *    cliente) para evitar transferir saldo entre clientes por error.
   * Devuelve los documentos (con balanceDue) listos para saldar.
   */
  private async loadSettleableSales(
    settlements: Array<{ saleId: string; amount: number }>,
    clientId: string | undefined,
    isPartial: boolean,
  ): Promise<Array<{ sale: SaleDocument; amount: number }>> {
    const list = (settlements || []).filter((x) => x && x.saleId);
    if (list.length === 0) return [];

    if (isPartial) {
      throw new BadRequestException(
        'No se puede cobrar el saldo de ventas anteriores en una venta parcial. Cobrá el saldo en una venta normal.',
      );
    }

    // Una entrada por venta: si llegan repetidas, sumamos los montos.
    const amountById = new Map<string, number>();
    for (const x of list) {
      amountById.set(x.saleId, Number(((amountById.get(x.saleId) || 0) + (x.amount || 0)).toFixed(2)));
    }
    const ids = [...amountById.keys()];

    const sales = await this.saleModel
      .find({ _id: { $in: ids }, deletedAt: { $exists: false } })
      .exec();

    if (sales.length !== ids.length) {
      throw new BadRequestException(
        'Alguna de las ventas a saldar no existe o fue eliminada.',
      );
    }

    const result: Array<{ sale: SaleDocument; amount: number }> = [];
    for (const s of sales) {
      const canSettle =
        (s.status === SaleStatus.PENDING || s.status === SaleStatus.PARTIAL) &&
        (s.balanceDue ?? 0) > 0.01;
      if (!canSettle) {
        throw new BadRequestException(
          `La venta ${s.saleNumber} no tiene saldo pendiente para cobrar (estado: ${s.status}, saldo: ${(s.balanceDue ?? 0).toFixed(2)}).`,
        );
      }
      if (clientId && s.clientId && s.clientId.toString() !== clientId) {
        throw new BadRequestException(
          `La venta ${s.saleNumber} pertenece a otro cliente y no puede saldarse en esta venta.`,
        );
      }
      const amount = Number((amountById.get(String(s._id)) || 0).toFixed(2));
      if (amount <= 0) {
        throw new BadRequestException(
          `El monto a abonar de la venta ${s.saleNumber} debe ser mayor a 0.`,
        );
      }
      if (amount > (s.balanceDue ?? 0) + 0.01) {
        throw new BadRequestException(
          `El monto a abonar de la venta ${s.saleNumber} ($${amount.toFixed(2)}) supera su saldo pendiente ($${(s.balanceDue ?? 0).toFixed(2)}).`,
        );
      }
      result.push({ sale: s, amount });
    }

    return result;
  }

  /**
   * Aplica los abonos a cuenta cobrados dentro de `newSale`. Por cada venta
   * vieja se cobra `amount` (parcial o total) de su saldo. NO se le agrega
   * pago: la plata ya quedó registrada en la venta nueva. El monto abonado se
   * vuelca a `discount` y baja el `total` de la venta vieja, reduciendo su
   * `balanceDue` en ese monto (espeja el cierre de caja). Si el saldo restante
   * llega a 0 la venta pasa a COMPLETED; si no, sigue con su saldo. Así la
   * plata se cuenta una sola vez (en la venta nueva) y el stock no se duplica.
   */
  private async settleTransferredSales(
    items: Array<{ sale: SaleDocument; amount: number }>,
    newSale: SaleDocument,
  ): Promise<void> {
    const refs: string[] = [];

    for (const { sale: s, amount } of items) {
      const prevBalance = Number((s.balanceDue || 0).toFixed(2));
      const newBalance = Number(Math.max(0, prevBalance - amount).toFixed(2));
      s.discount = Number(((s.discount || 0) + amount).toFixed(2));
      s.total = Number(((s.total || 0) - amount).toFixed(2));
      s.balanceDue = newBalance;
      if (newBalance <= 0.01) {
        s.balanceDue = 0;
        s.status = SaleStatus.COMPLETED;
      }
      const note =
        newBalance <= 0.01
          ? `Saldo de $${amount.toFixed(2)} cobrado en la venta ${newSale.saleNumber}. Venta saldada.`
          : `Abono de $${amount.toFixed(2)} cobrado en la venta ${newSale.saleNumber}. Saldo restante: $${newBalance.toFixed(2)}.`;
      s.notes = s.notes ? `${s.notes}\n${note}` : note;
      await s.save();
      refs.push(`${s.saleNumber} ($${amount.toFixed(2)})`);
    }

    // Dejar registrado en la venta nueva qué abonos incluye.
    const note = `Incluye abono(s) a cuenta de venta(s) anterior(es): ${refs.join(', ')}.`;
    newSale.notes = newSale.notes ? `${newSale.notes}\n${note}` : note;
    await newSale.save();
  }

  /**
   * Renombra la venta (edición inline desde la tabla). Es un cambio liviano:
   * NO pasa por las reglas de transición de estado de `update()` para que se
   * pueda renombrar incluso ventas ya COMPLETED. Enviar string vacío deja la
   * venta sin nombre (el front mostrará "-").
   */
  async updateName(id: string, name?: string): Promise<Sale> {
    const sale = await this.saleModel.findById(id).exec();
    if (!sale || sale.deletedAt) {
      throw new VentaNoEncontradaException(id);
    }
    const trimmed = (name ?? '').trim();
    sale.set('name', trimmed || undefined);
    await sale.save();
    return this.mapToSaleResponse(sale);
  }

  /**
   * Agrega pagos a una venta PARTIAL (completar saldo de una seña). Cada nuevo
   * pago se stampa con `createdAt = now`, así suma a la caja del día en que
   * se ingresa (no la del día original de la venta).
   *
   * Si `markCompleted` es true (equivale a destildar "Pago parcial"), la venta
   * pasa a COMPLETED y `balanceDue = 0`. Si los pagos acumulados no llegan al
   * total, la diferencia se registra como descuento auto (acorde al flujo
   * normal de venta).
   *
   * Si `markCompleted` es false (default), la venta sigue PARTIAL con
   * `balanceDue = total − Σ pagos`. Si los pagos exceden el total, error.
   */
  async addPayments(id: string, dto: AddSalePaymentsDto): Promise<Sale> {
    const sale = await this.saleModel.findById(id).exec();
    if (!sale || sale.deletedAt) {
      throw new VentaNoEncontradaException(id);
    }
    if (sale.status === SaleStatus.CANCELLED) {
      throw new VentaCanceladaException(sale.saleNumber);
    }
    // Sólo tiene sentido agregar pagos a una venta con saldo pendiente.
    // Acepta tanto PENDING como PARTIAL (seña real con balanceDue > 0).
    const canAddPayment =
      (sale.status === SaleStatus.PENDING || sale.status === SaleStatus.PARTIAL) &&
      (sale.balanceDue ?? 0) > 0.01;
    if (!canAddPayment) {
      throw new BadRequestException(
        `Sólo se pueden agregar pagos a una venta pendiente con saldo. Estado actual: ${sale.status}, saldo: ${(sale.balanceDue ?? 0).toFixed(2)}.`,
      );
    }

    const newLines = this.buildSalePayments(dto.payments);
    // Combinar pagos por método: si la venta ya tiene CASH y el nuevo pago
    // también es CASH, sumamos los amounts y dejamos createdAt = now en el
    // pago combinado para que cuente para la caja actual.
    // Decisión: en lugar de combinar, los dejamos como entradas separadas para
    // preservar la fecha individual de cada pago (clave para el arqueo por día).
    const allPayments = [...sale.payments, ...newLines];

    const newSum = allPayments.reduce((acc, p) => acc + (p.amount || 0), 0);
    const total = sale.total;
    const overpaysBy = newSum - total;

    if (overpaysBy > 0.01) {
      throw new BadRequestException(
        `Los pagos acumulados (${newSum.toFixed(2)}) superan el total de la venta (${total.toFixed(2)}).`,
      );
    }

    sale.payments = allPayments as any;

    if (dto.markCompleted) {
      // Completar la venta. Si pagaron menos que el total, la diferencia queda
      // como descuento (autoDiscount), reduciendo el total a lo efectivamente
      // cobrado. Así la reportería queda coherente con la caja.
      if (newSum < total - 0.01) {
        const autoDiscount = Number((total - newSum).toFixed(2));
        sale.discount = Number(((sale.discount || 0) + autoDiscount).toFixed(2));
        sale.total = Number(newSum.toFixed(2));
      }
      sale.balanceDue = 0;
      sale.status = SaleStatus.COMPLETED;
    } else {
      // Sigue PENDING con el saldo actualizado.
      sale.balanceDue = Number((total - newSum).toFixed(2));
    }

    await sale.save();
    return this.mapToSaleResponse(sale);
  }

  async update(id: string, updateSaleDto: UpdateSaleDto): Promise<Sale> {
    try {
      const existingSale = await this.findOne(id);

      // Verificar que la venta no esté ya cancelada
      if (existingSale.status === SaleStatus.CANCELLED) {
        throw new VentaCanceladaException(existingSale.saleNumber);
      }

      // Reglas de transición de estado:
      // 1. Cancelar: permitido desde cualquier estado salvo CANCELLED.
      // 2. Facturar post-completado: permitido si la venta está COMPLETED
      //    y todavía no tiene CAE (caso "facturé después del comprobante").
      // 3. Resto de updates: bloqueados si la venta ya está COMPLETED
      //    (regla original — los datos de una venta cerrada no se tocan).
      const isInvoicingCompleted =
        !!updateSaleDto.shouldInvoice &&
        existingSale.status === SaleStatus.COMPLETED &&
        !existingSale.afipCae;

      if (updateSaleDto.status === SaleStatus.CANCELLED) {
        // Permitir cancelación desde cualquier estado excepto ya cancelada
      } else if (isInvoicingCompleted) {
        // Permitir facturación post-completado
      } else if (existingSale.status === SaleStatus.COMPLETED) {
        throw new VentaYaCompletadaException(existingSale.saleNumber);
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
        const currentDiscountFlat = updateData.discount !== undefined ? updateData.discount : existingSale.discount;
        const currentPrepaidUsed = updateData.prepaidUsed !== undefined ? updateData.prepaidUsed : existingSale.prepaidUsed;

        // Validar que prepaidUsed no sea mayor al total
        this.validatePrepaidUsed(currentPrepaidUsed, currentSubtotal, currentTaxPercent, currentDiscountFlat);

        // Calcular nuevo total
        const totals = this.calculateTotal(currentSubtotal, currentTaxPercent, currentDiscountFlat, currentPrepaidUsed);
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
      // Para ventas con pago parcial (PENDING con saldo) Σ pagos puede ser < total:
      // la diferencia queda como `balanceDue`. Para el resto exigimos
      // Σ pagos === total (no auto-descontamos acá). Ya NO existe el estado seña:
      // estas ventas quedan PENDING y siguen el flujo normal.
      const isPartial =
        updateSaleDto.isPartial === true ||
        (updateSaleDto.isPartial === undefined &&
          (existingSale.status === SaleStatus.PARTIAL ||
            (existingSale.status === SaleStatus.PENDING &&
              (existingSale.balanceDue ?? 0) > 0.01)));

      if (updateSaleDto.payments) {
        const totalForPayments = updateData.total ?? existingSale.total;
        const sum = updateSaleDto.payments.reduce((acc, p) => acc + (p.amount || 0), 0);

        if (isPartial) {
          if (sum <= 0) {
            throw new BadRequestException(
              'Una venta con pago parcial requiere al menos un pago > 0.',
            );
          }
          if (sum > totalForPayments + 0.01) {
            throw new BadRequestException(
              `Los pagos parciales (${sum.toFixed(2)}) no pueden exceder el total (${totalForPayments.toFixed(2)}).`,
            );
          }
          updateData.balanceDue = Number((totalForPayments - sum).toFixed(2));
          updateData.status = SaleStatus.PENDING;
        } else {
          // Venta normal: se salda con lo cobrado. Si Σ pagos difiere del total,
          // el total pasa a ser lo cobrado y la diferencia se registra como
          // ajuste con signo (positivo = descuento, negativo = recargo). Ya no
          // se bloquea el sobre-cobro (alineado con `create`).
          const autoAdjust = Number((totalForPayments - sum).toFixed(2));
          if (Math.abs(autoAdjust) > 0.01) {
            const baseDiscount =
              updateData.discount !== undefined
                ? updateData.discount
                : existingSale.discount;
            updateData.discount = Number((baseDiscount + autoAdjust).toFixed(2));
            updateData.total = Number(sum.toFixed(2));
          }
        }
        updateData.payments = this.buildSalePayments(updateSaleDto.payments);
      }

      // Normalizar email si se proporciona
      if (updateSaleDto.customerEmail) {
        updateData.customerEmail = updateSaleDto.customerEmail.toLowerCase();
      }

      // Manejar facturación AFIP. Dispara en dos casos:
      // 1. Al completar la venta con factura: shouldInvoice + status COMPLETED en el payload.
      // 2. Al facturar una venta ya completada sin CAE (post-completado).
      // En ambos casos, si la facturación falla la venta NO se actualiza.
      if (updateSaleDto.shouldInvoice && (updateSaleDto.status === SaleStatus.COMPLETED || isInvoicingCompleted)) {
        try {
          const invoiceData = await this.generateAfipInvoice(existingSale, {
            invoiceType: updateSaleDto.invoiceType,
            cuit: updateSaleDto.invoiceCuit,
            taxCondition: updateSaleDto.invoiceTaxCondition,
          });
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
    
    // Quitar esta venta de las relacionadas (vínculo mutuo) para no dejar
    // referencias colgando a una venta borrada.
    await this.saleModel.updateMany(
      { relatedSaleIds: new Types.ObjectId(id) },
      { $pull: { relatedSaleIds: new Types.ObjectId(id) } },
    );

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
        totalByStatus: {
          [SaleStatus.PENDING]: 0,
          [SaleStatus.COMPLETED]: 0,
          [SaleStatus.CANCELLED]: 0,
          [SaleStatus.PARTIAL]: 0,
        },
      };

      for (const sale of sales) {
        for (const p of sale.payments || []) {
          summary.totalByPaymentMethod[p.method] =
            (summary.totalByPaymentMethod[p.method] ?? 0) + p.amount;
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
            createdAt: p.createdAt ?? sale.createdAt,
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

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DateTime } from 'luxon';
import {
  CreditNoteDocument,
  SaleDocument,
} from '../common/schemas';
import { IssueCreditNoteDto } from '../common/dto';

export interface CreditNoteResponse {
  id: string;
  noteNumber: string;
  saleId: string;
  saleNumber?: string;
  amount: number;
  reason?: string;
  status: 'AUTHORIZED' | 'FAILED' | 'CANCELLED' | 'INTERNAL';
  afipCae?: string;
  afipNumero?: number;
  afipFechaVto?: string;
  afipError?: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class CreditNotesService {
  constructor(
    @InjectModel('CreditNote') private readonly cnModel: Model<CreditNoteDocument>,
    @InjectModel('Sale') private readonly saleModel: Model<SaleDocument>,
  ) {}

  private map(doc: CreditNoteDocument): CreditNoteResponse {
    const obj = doc.toObject();
    return {
      id: obj._id.toString(),
      noteNumber: obj.noteNumber,
      saleId: obj.saleId.toString(),
      saleNumber: obj.saleNumber,
      amount: obj.amount,
      reason: obj.reason,
      status: obj.status,
      afipCae: obj.afipCae,
      afipNumero: obj.afipNumero,
      afipFechaVto: obj.afipFechaVto,
      afipError: obj.afipError,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }

  private async generateNoteNumber(): Promise<string> {
    const today = DateTime.now().setZone('America/Argentina/Buenos_Aires');
    const prefix = `NC-${today.year}-${String(today.month).padStart(2, '0')}${String(today.day).padStart(2, '0')}`;
    const last = await this.cnModel
      .findOne({ noteNumber: { $regex: `^${prefix}` } })
      .sort({ noteNumber: -1 })
      .exec();
    if (!last) return `${prefix}-001`;
    const lastNum = parseInt(last.noteNumber.split('-').pop() || '0');
    return `${prefix}-${String(lastNum + 1).padStart(3, '0')}`;
  }

  /**
   * Emite NC de tipo 13 (Nota de Crédito C) en AFIP, asociada al comprobante
   * original de la venta. Reusa el mismo motor de afip-hub que la facturación.
   * Si AFIP falla, se persiste status FAILED con el mensaje de error.
   */
  private async emitAfipCreditNote(
    sale: SaleDocument,
    amount: number,
  ): Promise<{ cae: string; numeroComprobante: number; caeFchVto: string } | { error: string }> {
    try {
      const afipApiUrl = process.env.AFIP_API_URL || 'https://api.afip-hub.com/api';
      const certificateApiUrl =
        process.env.AFIP_CERTIFICATE_API_URL ||
        'https://afip-facturacion-production.up.railway.app/api';
      const certificateId = process.env.AFIP_CERTIFICATE_ID || '154';
      const cuitEmisor = process.env.AFIP_CUIT || '';
      const puntoVenta = parseInt(process.env.AFIP_PUNTO_VENTA || '1', 10);

      if (!cuitEmisor || !certificateId) {
        return { error: 'Configuración AFIP incompleta' };
      }
      if (!sale.afipCae || !sale.afipNumero) {
        return { error: 'La venta no tiene factura AFIP asociada (no se puede emitir NC AFIP)' };
      }

      const certResp = await fetch(`${certificateApiUrl}/get-certificate/${certificateId}`);
      if (!certResp.ok) return { error: `Certificado: ${certResp.statusText}` };
      const { cert: certificado, key: clavePrivada } = await certResp.json();

      // Próximo número para tipo 13 (NC C)
      const ultResp = await fetch(`${afipApiUrl}/afip/ultimo-autorizado`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          puntoVenta,
          tipoComprobante: 13,
          cuitEmisor,
          certificado,
          clavePrivada,
        }),
      });
      if (!ultResp.ok) return { error: `Último autorizado: ${ultResp.statusText}` };
      const ultData = await ultResp.json();
      if (!ultData.success) return { error: ultData.message || 'Error último autorizado' };
      const proximoNumero = ultData.data.proximoNumero;

      const fecha = DateTime.now().setZone('America/Argentina/Buenos_Aires').toFormat('yyyyMMdd');

      // Tipo 13: Nota de Crédito C — consumidor final, no discrimina IVA.
      const body = {
        puntoVenta,
        tipoComprobante: 13,
        numero: proximoNumero,
        cuitEmisor,
        certificado,
        clavePrivada,
        importeNeto: 0,
        importeIva: 0,
        importeTotal: amount,
        importeNetoGravado: amount,
        importeExento: 0,
        importeNetoNoGravado: 0,
        fechaComprobante: fecha,
        // Comprobante asociado: la factura original
        comprobantesAsociados: [
          {
            tipo: 11, // Factura C original
            puntoVenta,
            numero: sale.afipNumero,
            cuit: cuitEmisor,
          },
        ],
      };

      const emitResp = await fetch(`${afipApiUrl}/afip/emitir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!emitResp.ok) return { error: `Emitir: ${emitResp.statusText}` };
      const emitData = await emitResp.json();
      if (!emitData.success) return { error: emitData.message || 'Error emitir NC' };

      return {
        cae: emitData.data.cae,
        numeroComprobante: proximoNumero,
        caeFchVto: emitData.data.caeFchVto,
      };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }

  async issueForSale(
    saleId: string,
    dto: IssueCreditNoteDto,
    userId?: string,
  ): Promise<CreditNoteResponse> {
    const sale = await this.saleModel.findById(saleId).exec();
    if (!sale) throw new NotFoundException(`Venta ${saleId} no encontrada`);

    const amount = dto.amount ?? sale.total;
    if (amount <= 0) {
      throw new BadRequestException('El monto de la NC debe ser mayor a 0');
    }
    if (amount > sale.total) {
      throw new BadRequestException(
        `El monto de la NC (${amount}) no puede superar el total de la venta (${sale.total})`,
      );
    }

    const noteNumber = await this.generateNoteNumber();

    // Si la venta tiene factura AFIP, intentar emitir AFIP. Caso contrario,
    // queda como NC interna (no llega a AFIP).
    let status: 'AUTHORIZED' | 'FAILED' | 'INTERNAL' = 'INTERNAL';
    let afipFields: Partial<{
      afipCae: string;
      afipNumero: number;
      afipFechaVto: string;
      afipError: string;
    }> = {};
    if (sale.afipCae) {
      const result = await this.emitAfipCreditNote(sale, amount);
      if ('cae' in result) {
        status = 'AUTHORIZED';
        afipFields = {
          afipCae: result.cae,
          afipNumero: result.numeroComprobante,
          afipFechaVto: result.caeFchVto,
        };
      } else {
        status = 'FAILED';
        afipFields = { afipError: result.error };
      }
    }

    const cn = await this.cnModel.create({
      noteNumber,
      saleId: sale._id,
      saleNumber: sale.saleNumber,
      amount,
      reason: dto.reason,
      status,
      issuedByUserId: userId,
      ...afipFields,
    });

    return this.map(cn);
  }

  async findBySale(saleId: string): Promise<CreditNoteResponse[]> {
    const list = await this.cnModel.find({ saleId }).sort({ createdAt: -1 }).exec();
    return list.map((d) => this.map(d));
  }

  async findOne(id: string): Promise<CreditNoteResponse> {
    const doc = await this.cnModel.findById(id).exec();
    if (!doc) throw new NotFoundException(`Nota de crédito ${id} no encontrada`);
    return this.map(doc);
  }

  async findAll(page = 1, limit = 10): Promise<{ data: CreditNoteResponse[]; total: number; page: number; limit: number }> {
    const skip = (page - 1) * limit;
    const [docs, total] = await Promise.all([
      this.cnModel.find().sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.cnModel.countDocuments().exec(),
    ]);
    return { data: docs.map((d) => this.map(d)), total, page, limit };
  }
}

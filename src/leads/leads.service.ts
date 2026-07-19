import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Lead, LeadDocument } from '../common/schemas/lead.schema';
import {
  Reservation,
  ReservationDocument,
} from '../common/schemas/reservation.schema';
import {
  CreateLeadDto,
  ListLeadsQueryDto,
  OrphanReceiptDto,
  UpdateLeadDto,
} from '../common/dto/lead.dto';
import { LeadSource } from '../common/enums/lead.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { SpacesService } from '../common/services/spaces.service';

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    @InjectModel(Lead.name) private readonly leadModel: Model<LeadDocument>,
    @InjectModel(Reservation.name)
    private readonly reservationModel: Model<ReservationDocument>,
    private readonly notifications: NotificationsService,
    private readonly spaces: SpacesService,
  ) {}

  /** Alta pública de una consulta (la usa el bot y la web). */
  async create(dto: CreateLeadDto) {
    const doc = await this.leadModel.create({
      service: dto.service,
      experienceId: dto.experienceId
        ? new Types.ObjectId(dto.experienceId)
        : undefined,
      preferredDate: dto.preferredDate,
      quantity: dto.quantity,
      customerName: dto.customerName,
      customerEmail: dto.customerEmail,
      customerPhone: dto.customerPhone,
      source: dto.source ?? LeadSource.WHATSAPP,
      notes: dto.notes,
    });

    // Aviso al equipo (best-effort, no bloquea el alta).
    const detalle = [
      `📩 *Nueva consulta*: ${doc.service}`,
      `Cliente: ${doc.customerName}`,
      doc.customerPhone ? `Tel: ${doc.customerPhone}` : '',
      doc.preferredDate ? `Fecha: ${doc.preferredDate}` : '',
      doc.quantity ? `Personas: ${doc.quantity}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    void this.notifications.notifyTeam(detalle);

    return { id: String(doc._id), service: doc.service, status: doc.status };
  }

  /**
   * Comprobante de transferencia SIN reserva (hold) pendiente, recibido por
   * WhatsApp. Guarda la imagen en Spaces (privada), matchea el monto contra
   * las últimas 3 reservas del teléfono y registra la consulta para que el
   * equipo la verifique. El "ok" automático es sólo interno: el cliente NUNCA
   * se entera del resultado del match (siempre pasa por verificación humana).
   */
  async registerOrphanReceipt(dto: OrphanReceiptDto) {
    // Últimas 3 reservas del teléfono (match laxo por sufijo, como en clients).
    const core = this.phoneCore(dto.phone);
    const pattern =
      core.length >= 6 ? core.slice(-8).split('').join('\\D*') : null;
    const reservations = pattern
      ? await this.reservationModel
          .find({
            deletedAt: { $exists: false },
            customerPhone: { $regex: pattern },
          })
          .sort({ createdAt: -1 })
          .limit(3)
          .lean()
      : [];

    // Match de monto contra seña / total / saldo de esas reservas (±1%).
    const amount = dto.amountDetected;
    let matched: { code: string; field: string; value: number } | null = null;
    if (typeof amount === 'number' && amount > 0) {
      for (const r of reservations) {
        const fields: [string, number][] = [
          ['seña', r.depositAmount],
          ['total', r.totalAmount],
          ['saldo', r.balanceDue],
        ];
        for (const [field, value] of fields) {
          if (value > 0 && Math.abs(amount - value) <= Math.max(1, value * 0.01)) {
            matched = { code: r.code, field, value };
            break;
          }
        }
        if (matched) break;
      }
    }
    const autoOk = Boolean(dto.destinatarioOk && matched);

    // Imagen a Spaces (privada). Best-effort: sin bucket o con error, la
    // consulta se registra igual y queda constancia de que no hay imagen.
    let imageKey = '';
    if (this.spaces.enabled) {
      try {
        const buf = Buffer.from(dto.imageBase64, 'base64');
        const ext = (dto.imageMime || '').includes('png')
          ? 'png'
          : (dto.imageMime || '').includes('webp')
            ? 'webp'
            : 'jpg';
        const rand = Math.random().toString(36).slice(2, 10);
        imageKey = await this.spaces.uploadPrivate(
          `orphan-receipts/${Date.now()}-${rand}.${ext}`,
          buf,
          dto.imageMime || 'image/jpeg',
        );
      } catch (err) {
        this.logger.warn(`No se pudo subir el comprobante a Spaces: ${String(err)}`);
        imageKey = '';
      }
    }

    const customerName =
      reservations.find((r) => r.code === matched?.code)?.customerName ||
      reservations[0]?.customerName ||
      'Cliente de WhatsApp';
    const notes = [
      autoOk
        ? '✔ match automático OK — pendiente de verificación humana'
        : '✖ sin match automático — revisar a mano',
      typeof amount === 'number' ? `monto leído: $${amount}` : 'monto ilegible',
      matched
        ? `coincide con reserva ${matched.code} (${matched.field} $${matched.value})`
        : 'no coincide con las últimas reservas del número',
      dto.destinatarioOk ? 'destinatario OK' : 'destinatario NO coincide',
      dto.operationNumber ? `op ${dto.operationNumber}` : '',
      dto.receiptDate ? `fecha ${dto.receiptDate}` : '',
      imageKey ? `imagen: ${imageKey}` : 'imagen no guardada',
      dto.note || '',
    ]
      .filter(Boolean)
      .join(' · ');

    const doc = await this.leadModel.create({
      service: 'Comprobante de transferencia (sin reserva pendiente)',
      customerName,
      customerPhone: dto.phone,
      source: LeadSource.WHATSAPP,
      notes,
    });

    void this.notifications.notifyTeam(
      [
        '📎 *Comprobante recibido sin reserva pendiente*',
        `Cliente: ${customerName}`,
        `Tel: ${dto.phone}`,
        typeof amount === 'number' ? `Monto leído: $${amount}` : 'Monto ilegible',
        autoOk
          ? `✔ Match automático (reserva ${matched?.code}) — falta verificación humana`
          : '✖ Sin match automático — revisar a mano',
      ].join('\n'),
    );

    return { ok: true, leadId: String(doc._id), autoOk };
  }

  /** URL firmada de corta vida para ver la imagen de un comprobante (admin). */
  async receiptImageUrl(key: string) {
    if (!key || !key.startsWith('orphan-receipts/'))
      throw new BadRequestException('key inválida');
    if (!this.spaces.enabled)
      throw new BadRequestException('Bucket de imágenes no configurado');
    return { url: await this.spaces.signedUrl(key) };
  }

  /** Núcleo local de un teléfono argentino (mismo criterio que ClientsService). */
  private phoneCore(raw: string): string {
    let d = (raw || '').replace(/\D/g, '');
    if (d.startsWith('54')) d = d.slice(2); // código país AR
    if (d.length > 10 && d.startsWith('9')) d = d.slice(1); // móvil
    return d;
  }

  /** Listado paginado para el admin. */
  async list(query: ListLeadsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: Record<string, unknown> = { deletedAt: { $exists: false } };
    if (query.status) filter.status = query.status;
    if (query.source) filter.source = query.source;

    const [items, total] = await Promise.all([
      this.leadModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.leadModel.countDocuments(filter),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /** Actualiza estado/notas/datos de una consulta (admin). */
  async update(id: string, dto: UpdateLeadDto) {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('id inválido');
    const lead = await this.leadModel.findById(id).exec();
    if (!lead || lead.deletedAt)
      throw new NotFoundException('Consulta no encontrada');

    if (dto.service !== undefined) lead.service = dto.service;
    if (dto.preferredDate !== undefined) lead.preferredDate = dto.preferredDate;
    if (dto.quantity !== undefined) lead.quantity = dto.quantity;
    if (dto.customerName !== undefined) lead.customerName = dto.customerName;
    if (dto.customerEmail !== undefined) lead.customerEmail = dto.customerEmail;
    if (dto.customerPhone !== undefined) lead.customerPhone = dto.customerPhone;
    if (dto.notes !== undefined) lead.notes = dto.notes;
    if (dto.status !== undefined) lead.status = dto.status;
    lead.updatedAt = new Date();
    await lead.save();
    return lead.toObject();
  }
}

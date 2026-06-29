import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Lead, LeadDocument } from '../common/schemas/lead.schema';
import {
  CreateLeadDto,
  ListLeadsQueryDto,
  UpdateLeadDto,
} from '../common/dto/lead.dto';
import { LeadSource } from '../common/enums/lead.enum';

@Injectable()
export class LeadsService {
  constructor(
    @InjectModel(Lead.name) private readonly leadModel: Model<LeadDocument>,
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
    });
    return { id: String(doc._id), service: doc.service, status: doc.status };
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

import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ClientLabelDocument } from '../common/schemas/client-label.schema';
import { ClientDocument } from '../common/schemas/client.schema';
import { CreateClientLabelDto, UpdateClientLabelDto } from '../common/dto/client-label.dto';

@Injectable()
export class ClientLabelsService {
  constructor(
    @InjectModel('ClientLabel') private readonly labelModel: Model<ClientLabelDocument>,
    @InjectModel('Client') private readonly clientModel: Model<ClientDocument>,
  ) {}

  private mapLabel(label: ClientLabelDocument) {
    return {
      id: (label as any)._id.toString(),
      name: label.name,
      color: label.color,
      createdAt: (label as any).createdAt,
      updatedAt: (label as any).updatedAt,
    };
  }

  async findAll() {
    const labels = await this.labelModel
      .find({ deletedAt: { $exists: false } })
      .sort({ name: 1 })
      .exec();
    return labels.map((l) => this.mapLabel(l));
  }

  async create(dto: CreateClientLabelDto) {
    const existing = await this.labelModel.findOne({ name: dto.name, deletedAt: { $exists: false } }).exec();
    if (existing) throw new BadRequestException('Ya existe una etiqueta con ese nombre');
    const label = await this.labelModel.create(dto);
    return this.mapLabel(label);
  }

  async update(id: string, dto: UpdateClientLabelDto) {
    if (dto.name) {
      const existing = await this.labelModel.findOne({ name: dto.name, _id: { $ne: id }, deletedAt: { $exists: false } }).exec();
      if (existing) throw new BadRequestException('Ya existe una etiqueta con ese nombre');
    }
    const label = await this.labelModel.findOneAndUpdate(
      { _id: id, deletedAt: { $exists: false } },
      dto,
      { new: true },
    ).exec();
    if (!label) throw new NotFoundException('Etiqueta no encontrada');
    return this.mapLabel(label);
  }

  async remove(id: string) {
    const count = await this.clientModel.countDocuments({ labels: id, deletedAt: { $exists: false } }).exec();
    if (count > 0) {
      throw new BadRequestException(`La etiqueta está asignada a ${count} cliente(s). Desasignala antes de eliminarla.`);
    }
    const label = await this.labelModel.findOneAndUpdate(
      { _id: id, deletedAt: { $exists: false } },
      { deletedAt: new Date() },
      { new: true },
    ).exec();
    if (!label) throw new NotFoundException('Etiqueta no encontrada');
  }
}

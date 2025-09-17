import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DateTime } from 'luxon';
import { CreateEgressDto, UpdateEgressDto, EgressPaginatedFilterDto } from '../common/dto';
import { IEgress, PaginatedResponse } from '../common/interfaces';
import { 
  EgressNotFoundException,
  EgressNumberAlreadyExistsException,
  EgressCannotBeUpdatedException,
  EgressCannotBeDeletedException,
  InvalidEgressDataException
} from '../common/exceptions';
import { EgressDocument } from '../common/schemas';
import { EgressStatus } from '../common/enums';
import { buildDateFilter } from '../common/utils';

@Injectable()
export class EgressesService {
  constructor(
    @InjectModel('Egress') private readonly egressModel: Model<EgressDocument>,
  ) {}

  private mapToEgressResponse(egress: EgressDocument): IEgress {
    const egressObj = egress.toObject();
    return {
      _id: egressObj._id,
      egressNumber: egressObj.egressNumber,
      concept: egressObj.concept,
      amount: egressObj.amount,
      currency: egressObj.currency,
      type: egressObj.type,
      status: egressObj.status,
      notes: egressObj.notes,
      authorizedBy: egressObj.authorizedBy,
      userId: egressObj.userId,
      createdAt: egressObj.createdAt,
      updatedAt: egressObj.updatedAt,
      deletedAt: egressObj.deletedAt,
    };
  }

  private async generateEgressNumber(): Promise<string> {
    const today = DateTime.now().toFormat('yyyyMMdd');
    const prefix = `EGR-${today}`;
    
    // Find the latest egress number for today
    const latestEgress = await this.egressModel
      .findOne({
        egressNumber: { $regex: `^${prefix}` },
        deletedAt: null
      })
      .sort({ egressNumber: -1 })
      .lean();

    if (!latestEgress) {
      return `${prefix}-001`;
    }

    // Extract the sequence number and increment it
    const sequence = parseInt(latestEgress.egressNumber.split('-')[2]) + 1;
    return `${prefix}-${sequence.toString().padStart(3, '0')}`;
  }

  async create(createEgressDto: CreateEgressDto): Promise<IEgress> {
    const egressNumber = await this.generateEgressNumber();

    // Validate amount
    if (createEgressDto.amount <= 0) {
      throw new InvalidEgressDataException('El monto debe ser mayor que 0');
    }

    // Create the egress
    const createdEgress = new this.egressModel({
      ...createEgressDto,
      egressNumber,
      status: EgressStatus.PENDING,
    });

    await createdEgress.save();
    return this.mapToEgressResponse(createdEgress);
  }

  async findAll(filterDto: EgressPaginatedFilterDto): Promise<PaginatedResponse<IEgress>> {
    const { page = 1, limit = 10, search, from, to, status, type, currency } = filterDto;
    const skip = (page - 1) * limit;

    // Build the filter
    const filter: any = { deletedAt: null };

    // Search filter (by concept)
    if (search) {
      filter.$or = [
        { concept: { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } },
        { authorizedBy: { $regex: search, $options: 'i' } }
      ];
    }

    // Date filter
    const dateFilter = buildDateFilter(from, to);
    if (dateFilter) {
      filter.createdAt = dateFilter;
    }

    // Status filter
    if (status) {
      filter.status = status;
    }

    // Type filter
    if (type) {
      filter.type = type;
    }

    // Currency filter
    if (currency) {
      filter.currency = currency;
    }

    // Execute queries
    const [egresses, total] = await Promise.all([
      this.egressModel
        .find(filter)
        .populate('userId', 'username email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.egressModel.countDocuments(filter),
    ]);

    const mappedEgresses = egresses.map(egress => this.mapToEgressResponse(egress as EgressDocument));

    return {
      data: mappedEgresses,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPreviousPage: page > 1,
      },
    };
  }

  async findOne(id: string): Promise<IEgress> {
    const egress = await this.egressModel
      .findOne({ _id: id, deletedAt: null })
      .populate('userId', 'username email')
      .lean();

    if (!egress) {
      throw new EgressNotFoundException(id);
    }

    return this.mapToEgressResponse(egress as EgressDocument);
  }

  async update(id: string, updateEgressDto: UpdateEgressDto): Promise<IEgress> {
    const egress = await this.egressModel.findOne({ _id: id, deletedAt: null });

    if (!egress) {
      throw new EgressNotFoundException(id);
    }

    // Check if egress can be updated
    if (egress.status === EgressStatus.COMPLETED) {
      throw new EgressCannotBeUpdatedException('No se puede modificar un egreso completado');
    }

    // Validate amount if provided
    if (updateEgressDto.amount !== undefined && updateEgressDto.amount <= 0) {
      throw new InvalidEgressDataException('El monto debe ser mayor que 0');
    }

    // Update the egress
    Object.assign(egress, updateEgressDto);
    egress.updatedAt = new Date();

    await egress.save();
    return this.mapToEgressResponse(egress);
  }

  async remove(id: string): Promise<void> {
    const egress = await this.egressModel.findOne({ _id: id, deletedAt: null });

    if (!egress) {
      throw new EgressNotFoundException(id);
    }

    // Check if egress can be deleted
    if (egress.status === EgressStatus.COMPLETED) {
      throw new EgressCannotBeDeletedException('No se puede eliminar un egreso completado');
    }

    // Soft delete
    egress.deletedAt = new Date();
    egress.updatedAt = new Date();
    await egress.save();
  }

  async complete(id: string): Promise<IEgress> {
    const egress = await this.egressModel.findOne({ _id: id, deletedAt: null });

    if (!egress) {
      throw new EgressNotFoundException(id);
    }

    if (egress.status === EgressStatus.COMPLETED) {
      throw new EgressCannotBeUpdatedException('El egreso ya está completado');
    }

    if (egress.status === EgressStatus.CANCELLED) {
      throw new EgressCannotBeUpdatedException('No se puede completar un egreso cancelado');
    }

    egress.status = EgressStatus.COMPLETED;
    egress.updatedAt = new Date();
    
    await egress.save();
    return this.mapToEgressResponse(egress);
  }

  async cancel(id: string): Promise<IEgress> {
    const egress = await this.egressModel.findOne({ _id: id, deletedAt: null });

    if (!egress) {
      throw new EgressNotFoundException(id);
    }

    if (egress.status === EgressStatus.COMPLETED) {
      throw new EgressCannotBeUpdatedException('No se puede cancelar un egreso completado');
    }

    if (egress.status === EgressStatus.CANCELLED) {
      throw new EgressCannotBeUpdatedException('El egreso ya está cancelado');
    }

    egress.status = EgressStatus.CANCELLED;
    egress.updatedAt = new Date();
    
    await egress.save();
    return this.mapToEgressResponse(egress);
  }

  // Statistics methods
  async getTotalByPeriod(from?: string, to?: string): Promise<{ total: number; currency: string }[]> {
    const filter: any = { deletedAt: null, status: EgressStatus.COMPLETED };

    const dateFilter = buildDateFilter(from, to);
    if (dateFilter) {
      filter.createdAt = dateFilter;
    }

    const result = await this.egressModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$currency',
          total: { $sum: '$amount' }
        }
      },
      {
        $project: {
          _id: 0,
          currency: '$_id',
          total: 1
        }
      }
    ]);

    return result;
  }
}
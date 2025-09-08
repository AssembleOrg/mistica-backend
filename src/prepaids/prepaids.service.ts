import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreatePrepaidDto, PaginationDto } from '../common/dto';
import { PrepaidPaginationDto } from '../common/dto/prepaid-pagination.dto';
import { Prepaid, PaginatedResponse } from '../common/interfaces';
import { 
  PrepaidNoEncontradoException,
  PrepaidYaConsumidoException,
  PrepaidInsuficienteException,
  ClienteNoEncontradoException
} from '../common/exceptions';
import { PrepaidDocument, ClientDocument } from '../common/schemas';
import { buildDateFilter } from '../common/utils';
import { PrepaidStatus } from '../common/enums';

@Injectable()
export class PrepaidsService {
  constructor(
    @InjectModel('Prepaid') private readonly prepaidModel: Model<PrepaidDocument>,
    @InjectModel('Client') private readonly clientModel: Model<ClientDocument>,
  ) {}

  private mapToPrepaidResponse(prepaid: PrepaidDocument): Prepaid {
    const prepaidObj = prepaid.toObject();
  
    const client = prepaidObj.clientId && typeof prepaidObj.clientId === 'object'
      ? {
          id: prepaidObj.clientId._id.toString(),
          fullName: prepaidObj.clientId.fullName,
        }
      : {
          id: prepaidObj.clientId?.toString(),
          fullName: undefined,
        };
  
    return {
      id: prepaidObj._id.toString(),
      clientId: client.fullName,
      amount: prepaidObj.amount,
      status: prepaidObj.status,
      notes: prepaidObj.notes,
      consumedAt: prepaidObj.consumedAt,
      createdAt: prepaidObj.createdAt,
      updatedAt: prepaidObj.updatedAt,
      deletedAt: prepaidObj.deletedAt,
    };
  }
  
  async updateStatus(prepaidId: string, status: PrepaidStatus): Promise<void> {
    await this.prepaidModel.findByIdAndUpdate(prepaidId, { status }).exec();
  }

  async create(createPrepaidDto: CreatePrepaidDto, clientId: string): Promise<Prepaid> {
    try {
      // Verificar que el cliente existe
      const client = await this.clientModel.findOne({
        _id: clientId,
        deletedAt: { $exists: false }
      }).exec();

      if (!client) {
        throw new ClienteNoEncontradoException(clientId);
      }

      // Crear prepaid
      const prepaid = await this.prepaidModel.create({
        ...createPrepaidDto,
        clientId,
        status: PrepaidStatus.PENDING,
      });

      if (!prepaid || !prepaid._id) {
        throw new BadRequestException('Error al crear el prepaid');
      }

      return this.mapToPrepaidResponse(prepaid);
    } catch (error) {
      if (error instanceof ClienteNoEncontradoException || 
          error instanceof BadRequestException) {
        throw error;
      }
      console.error('Error creating prepaid:', error);
      throw new BadRequestException('Error durante la creación del prepaid');
    }
  }

  async findAll(paginationDto?: PrepaidPaginationDto): Promise<PaginatedResponse<Prepaid>> {
    const { page = 1, limit = 10, status, search, from, to } = paginationDto || {};
    const skip = (page - 1) * limit;

    // Construir filtro
    const filter: any = { deletedAt: { $exists: false } };
    
    if (status) {
      filter.status = status;
    }
    
    // Filtros de fecha
    const dateFilter = buildDateFilter(from, to);
    Object.assign(filter, dateFilter);
    
    // Para búsqueda por cliente, necesitamos hacer una agregación más compleja
    let query;
    if (search && search.trim()) {
      query = this.prepaidModel.aggregate([
        {
          $lookup: {
            from: 'clients',
            localField: 'clientId',
            foreignField: '_id',
            as: 'client'
          }
        },
        {
          $match: {
            ...filter,
            $or: [
              { 'client.fullName': { $regex: search.trim(), $options: 'i' } },
              { 'client.email': { $regex: search.trim(), $options: 'i' } }
            ]
          }
        },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit }
      ]);
    } else {
      query = this.prepaidModel.find(filter)
        .populate('clientId', 'fullName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
    }

    const [prepaids, total] = await Promise.all([
      query.exec(),
      search && search.trim() 
        ? this.prepaidModel.aggregate([
            {
              $lookup: {
                from: 'clients',
                localField: 'clientId',
                foreignField: '_id',
                as: 'client'
              }
            },
            {
              $match: {
                ...filter,
                $or: [
                  { 'client.fullName': { $regex: search.trim(), $options: 'i' } },
                  { 'client.email': { $regex: search.trim(), $options: 'i' } }
                ]
              }
            },
            { $count: 'total' }
          ]).then(result => result[0]?.total || 0)
        : this.prepaidModel.countDocuments(filter).exec(),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: prepaids.map(prepaid => this.mapToPrepaidResponse(prepaid)),
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

  async findWithoutPagination(): Promise<Prepaid[]> {
    const prepaids = await this.prepaidModel.find({ 
      deletedAt: { $exists: false } 
    }).populate('clientId', 'fullName email').sort({ createdAt: -1 }).exec();

    return prepaids.map(prepaid => this.mapToPrepaidResponse(prepaid));
  }

  async findByStatus(paginationDto: PrepaidPaginationDto): Promise<PaginatedResponse<Prepaid>> {
    const { page = 1, limit = 10, status, search, from, to } = paginationDto;
    const skip = (page - 1) * limit;

    if (!status) {
      throw new BadRequestException('El status es requerido para filtrar prepaids');
    }

    const filter: any = { 
      deletedAt: { $exists: false },
      status: status
    };
    
    // Filtros de fecha
    const dateFilter = buildDateFilter(from, to);
    Object.assign(filter, dateFilter);
    
    // Para búsqueda por cliente, necesitamos hacer una agregación más compleja
    let query;
    if (search && search.trim()) {
      query = this.prepaidModel.aggregate([
        {
          $lookup: {
            from: 'clients',
            localField: 'clientId',
            foreignField: '_id',
            as: 'client'
          }
        },
        {
          $match: {
            ...filter,
            $or: [
              { 'client.fullName': { $regex: search.trim(), $options: 'i' } },
              { 'client.email': { $regex: search.trim(), $options: 'i' } }
            ]
          }
        },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit }
      ]);
    } else {
      query = this.prepaidModel.find(filter)
        .populate('clientId', 'fullName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
    }

    const [prepaids, total] = await Promise.all([
      query.exec(),
      search && search.trim() 
        ? this.prepaidModel.aggregate([
            {
              $lookup: {
                from: 'clients',
                localField: 'clientId',
                foreignField: '_id',
                as: 'client'
              }
            },
            {
              $match: {
                ...filter,
                $or: [
                  { 'client.fullName': { $regex: search.trim(), $options: 'i' } },
                  { 'client.email': { $regex: search.trim(), $options: 'i' } }
                ]
              }
            },
            { $count: 'total' }
          ]).then(result => result[0]?.total || 0)
        : this.prepaidModel.countDocuments(filter).exec(),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: prepaids.map(prepaid => this.mapToPrepaidResponse(prepaid)),
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

  async findOne(id: string): Promise<Prepaid> {
    const prepaid = await this.prepaidModel.findOne({
      _id: id,
      deletedAt: { $exists: false }
    }).populate('clientId', 'fullName email').exec();

    if (!prepaid) {
      throw new PrepaidNoEncontradoException(id);
    }

    return this.mapToPrepaidResponse(prepaid);
  }

  async findByClientId(clientId: string): Promise<Prepaid[]> {
    const prepaids = await this.prepaidModel.find({
      clientId,
      deletedAt: { $exists: false }
    }).sort({ createdAt: -1 }).exec();

    return prepaids.map(prepaid => this.mapToPrepaidResponse(prepaid));
  }

  async findPendingByClientId(clientId: string): Promise<Prepaid[]> {
    const prepaids = await this.prepaidModel.find({
      clientId,
      status: PrepaidStatus.PENDING,
      deletedAt: { $exists: false }
    }).sort({ createdAt: -1 }).exec();

    return prepaids.map(prepaid => this.mapToPrepaidResponse(prepaid));
  }

  async getClientTotalPrepaidAmount(clientId: string): Promise<number> {
    const prepaids = await this.prepaidModel.find({
      clientId,
      status: PrepaidStatus.PENDING,
      deletedAt: { $exists: false }
    }).exec();

    return prepaids.reduce((total, prepaid) => total + prepaid.amount, 0);
  }

  async consumePrepaidAmount(clientId: string, amount: number): Promise<{ consumed: number; remaining: number }> {
    try {

      const pendingPrepaids = await this.prepaidModel.find({
        clientId,
        status: PrepaidStatus.PENDING,
        deletedAt: { $exists: false }
      }).sort({ createdAt: 1 }).exec(); // Ordenar por fecha de creación (FIFO)

      let remainingAmount = amount;
      let consumedAmount = 0;

      for (const prepaid of pendingPrepaids) {
        if (remainingAmount <= 0) break;

        if (prepaid.amount <= remainingAmount) {
          // Consumir todo el prepaid
          await this.prepaidModel.findByIdAndUpdate(prepaid._id, {
            status: PrepaidStatus.CONSUMED,
            consumedAt: new Date(),
          }).exec();

          consumedAmount += prepaid.amount;
          remainingAmount -= prepaid.amount;
        } else {
          // Crear un nuevo prepaid con el monto restante
          const newAmount = prepaid.amount - remainingAmount;
          
          // Actualizar el prepaid actual con el monto restante
          await this.prepaidModel.findByIdAndUpdate(prepaid._id, {
            amount: newAmount,
          }).exec();

          // Crear un prepaid consumido con el monto usado
          await this.prepaidModel.create({
            clientId: prepaid.clientId,
            amount: remainingAmount,
            status: PrepaidStatus.CONSUMED,
            consumedAt: new Date(),
            notes: `Consumido de prepaid ${prepaid._id}`,
          });

          consumedAmount += remainingAmount;
          remainingAmount = 0;
        }
      }

      return {
        consumed: consumedAmount,
        remaining: 0,
      };
    } catch (error) {
      if (error instanceof PrepaidInsuficienteException) {
        throw error;
      }
      console.error('Error consuming prepaid amount:', error);
      throw new BadRequestException('Error al consumir el prepaid');
    }
  }

  async restorePrepaidAmount(clientId: string, amount: number): Promise<void> {
    try {
      // Crear un nuevo prepaid con el monto restaurado
      await this.prepaidModel.create({
        clientId,
        amount,
        status: PrepaidStatus.PENDING,
        notes: `Restaurado por cancelación de venta`,
      });
    } catch (error) {
      console.error('Error restoring prepaid amount:', error);
      throw new BadRequestException('Error al restaurar el prepaid');
    }
  }
}

import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateClientDto, UpdateClientDto, PaginatedDateFilterDto } from '../common/dto';
import { Client, ClientWithPrepaids, Prepaid, PaginatedResponse } from '../common/interfaces';
import { 
  ClienteNoEncontradoException, 
  EmailClienteYaExisteException,
  CuitClienteYaExisteException
} from '../common/exceptions';
import { ClientDocument, PrepaidDocument, SaleDocument } from '../common/schemas';
import { buildDateFilter } from '../common/utils';
import { PrepaidStatus } from '../common/enums';

@Injectable()
export class ClientsService {
  constructor(
    @InjectModel('Client') private readonly clientModel: Model<ClientDocument>,
    @InjectModel('Prepaid') private readonly prepaidModel: Model<PrepaidDocument>,
    @InjectModel('Sale') private readonly saleModel: Model<SaleDocument>,
  ) {}

  private mapToClientResponse(client: ClientDocument, prepaidAmount?: number, transactionCount?: number): Client {
    const clientObj = client.toObject();
    return {
      id: clientObj._id.toString(),
      fullName: clientObj.fullName,
      phone: clientObj.phone,
      email: clientObj.email,
      notes: clientObj.notes,
      cuit: clientObj.cuit,
      labels: (clientObj.labels || []).map((id: any) => id.toString()),
      createdAt: clientObj.createdAt,
      updatedAt: clientObj.updatedAt,
      deletedAt: clientObj.deletedAt,
      prepaid: prepaidAmount || 0,
      transactionCount: transactionCount || 0,
    };
  }

  private mapToPrepaidResponse(prepaid: PrepaidDocument): Prepaid {
    const prepaidObj = prepaid.toObject();
    return {
      id: prepaidObj._id.toString(),
      clientId: prepaidObj.clientId.toString(),
      amount: prepaidObj.amount,
      paymentMethod: prepaidObj.paymentMethod,
      status: prepaidObj.status,
      notes: prepaidObj.notes,
      consumedAt: prepaidObj.consumedAt,
      createdAt: prepaidObj.createdAt,
      updatedAt: prepaidObj.updatedAt,
      deletedAt: prepaidObj.deletedAt,
    };
  }

  private async calculateClientPrepaidAmount(clientId: string): Promise<number> {
    const prepaids = await this.prepaidModel.find({
      clientId,
      status: PrepaidStatus.PENDING,
      deletedAt: { $exists: false }
    }).exec();

    return prepaids.reduce((total, prepaid) => total + prepaid.amount, 0);
  }

  async create(createClientDto: CreateClientDto): Promise<ClientWithPrepaids> {
    try {
      // Validar email único si se proporciona
      if (createClientDto.email) {
        const existingClientByEmail = await this.clientModel.findOne({
          email: createClientDto.email.toLowerCase(),
          deletedAt: { $exists: false }
        }).exec();

        if (existingClientByEmail) {
          throw new BadRequestException('Cliente ya registrado con este email');
        }
      }

      // Validar CUIT único si se proporciona
      if (createClientDto.cuit) {
        const existingClientByCuit = await this.clientModel.findOne({
          cuit: createClientDto.cuit,
          deletedAt: { $exists: false }
        }).exec();

        if (existingClientByCuit) {
          throw new BadRequestException('Cliente ya registrado con este CUIT');
        }
      }

      // Crear cliente
      const clientData = {
        ...createClientDto,
        email: createClientDto.email?.toLowerCase(),
      };

      const client = await this.clientModel.create(clientData);

      if (!client || !client._id) {
        throw new BadRequestException('Error al crear el cliente');
      }

      // Crear prepaids si se proporcionan
      let prepaids: Prepaid[] = [];
      if (createClientDto.prepaids && createClientDto.prepaids.length > 0) {
        const prepaidData = createClientDto.prepaids.map(prepaid => ({
          ...prepaid,
          clientId: client._id,
        }));

        const createdPrepaids = await this.prepaidModel.create(prepaidData);
        prepaids = createdPrepaids.map(prepaid => this.mapToPrepaidResponse(prepaid));
      }

      const prepaidAmount = await this.calculateClientPrepaidAmount(client._id.toString());
      const transactionCount = 0; // Al crearlo es 0

      return {
        ...this.mapToClientResponse(client, prepaidAmount, transactionCount),
        prepaids,
      };
    } catch (error) {
      if (error instanceof EmailClienteYaExisteException || 
          error instanceof CuitClienteYaExisteException ||
          error instanceof BadRequestException) {
        throw error;
      }
      console.error('Error creating client:', error);
      throw new BadRequestException('Error durante la creación del cliente');
    }
  }

  /**
   * Busca un cliente por teléfono, tolerante al formato de guardado (espacios,
   * guiones, +, código de país). Compara por los últimos 8 dígitos (el número
   * local) permitiendo separadores. Devuelve sólo lo mínimo (nombre/email).
   * Uso interno del bot para autocompletar los datos del cliente.
   */
  async findByPhone(
    phone: string,
  ): Promise<{ found: boolean; fullName?: string; email?: string }> {
    const digits = (phone || '').replace(/\D/g, '');
    if (digits.length < 6) return { found: false };
    const tail = digits.slice(-8);
    // Inserta \D* entre cada dígito para matchear "11 3658-5581", "+54 9 11..."
    const pattern = tail.split('').join('\\D*');
    const client = await this.clientModel
      .findOne({
        deletedAt: { $exists: false },
        phone: { $regex: pattern },
      })
      .lean();
    if (!client) return { found: false };
    return { found: true, fullName: client.fullName, email: client.email };
  }

  async findAll(paginationDto?: PaginatedDateFilterDto): Promise<PaginatedResponse<Client>> {
    const { page = 1, limit = 10, search, from, to } = paginationDto || {};
    const skip = (page - 1) * limit;

    // Construir filtro de búsqueda
    const filter: any = { deletedAt: { $exists: false } };
    
    if (search && search.trim()) {
      filter.$or = [
        { fullName: { $regex: search.trim(), $options: 'i' } },
        { email: { $regex: search.trim(), $options: 'i' } },
        { phone: { $regex: search.trim(), $options: 'i' } },
        { cuit: { $regex: search.trim(), $options: 'i' } }
      ];
    }
    
    if (paginationDto?.labelId) {
      filter.labels = paginationDto.labelId;
    }

    // Filtros de fecha
    const dateFilter = buildDateFilter(from, to);
    Object.assign(filter, dateFilter);

    const [clients, total] = await Promise.all([
      this.clientModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.clientModel.countDocuments(filter).exec(),
    ]);

    // Calcular prepaid amount y transactions para cada cliente
    const clientsWithPrepaid = await Promise.all(
      clients.map(async (client) => {
        const clientId = client._id?.toString() || '';
        const [prepaidAmount, transactionCount] = await Promise.all([
          this.calculateClientPrepaidAmount(clientId),
          this.saleModel.countDocuments({ clientId, deletedAt: { $exists: false } }).exec(),
        ]);
        return this.mapToClientResponse(client, prepaidAmount, transactionCount);
      })
    );

    const totalPages = Math.ceil(total / limit);

    return {
      data: clientsWithPrepaid,
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

  async findWithoutPagination(search?: string): Promise<Client[]> {
    // Construir filtro de búsqueda
    const filter: any = { deletedAt: { $exists: false } };
    
    if (search && search.trim()) {
      filter.$or = [
        { fullName: { $regex: search.trim(), $options: 'i' } },
        { email: { $regex: search.trim(), $options: 'i' } },
        { phone: { $regex: search.trim(), $options: 'i' } },
        { cuit: { $regex: search.trim(), $options: 'i' } }
      ];
    }

    const clients = await this.clientModel.find(filter)
      .sort({ createdAt: -1 })
      .exec();

    // Calcular prepaid amount y transactions para cada cliente
    const clientsWithPrepaid = await Promise.all(
      clients.map(async (client) => {
        const clientId = client._id?.toString() || '';
        const [prepaidAmount, transactionCount] = await Promise.all([
          this.calculateClientPrepaidAmount(clientId),
          this.saleModel.countDocuments({ clientId, deletedAt: { $exists: false } }).exec(),
        ]);
        return this.mapToClientResponse(client, prepaidAmount, transactionCount);
      })
    );

    return clientsWithPrepaid;
  }

  async findOne(id: string): Promise<ClientWithPrepaids> {
    const client = await this.clientModel.findOne({
      _id: id,
      deletedAt: { $exists: false }
    }).exec();

    if (!client) {
      throw new ClienteNoEncontradoException(id);
    }

    // Obtener prepaids del cliente
    const prepaids = await this.prepaidModel.find({
      clientId: id,
      deletedAt: { $exists: false }
    }).sort({ createdAt: -1 }).exec();

    const prepaidAmount = await this.calculateClientPrepaidAmount(id);
    const transactionCount = await this.saleModel.countDocuments({ clientId: id, deletedAt: { $exists: false } }).exec();

    return {
      ...this.mapToClientResponse(client, prepaidAmount, transactionCount),
      prepaids: prepaids.map(prepaid => this.mapToPrepaidResponse(prepaid)),
    };
  }

  async update(id: string, updateClientDto: UpdateClientDto): Promise<ClientWithPrepaids> {
    try {
      const existingClient = await this.findOne(id);

      // Validar email único si se proporciona y es diferente al actual
      if (updateClientDto.email && updateClientDto.email !== existingClient.email) {
        const existingClientByEmail = await this.clientModel.findOne({
          email: updateClientDto.email.toLowerCase(),
          _id: { $ne: id },
          deletedAt: { $exists: false }
        }).exec();

        if (existingClientByEmail) {
          throw new BadRequestException('Cliente ya registrado con este email');
        }
      }

      // Validar CUIT único si se proporciona y es diferente al actual
      if (updateClientDto.cuit && updateClientDto.cuit !== existingClient.cuit) {
        const existingClientByCuit = await this.clientModel.findOne({
          cuit: updateClientDto.cuit,
          _id: { $ne: id },
          deletedAt: { $exists: false }
        }).exec();

        if (existingClientByCuit) {
          throw new BadRequestException('Cliente ya registrado con este CUIT');
        }
      }

      let updateData: any = { ...updateClientDto };

      // Normalizar email si se proporciona
      if (updateClientDto.email) {
        updateData.email = updateClientDto.email.toLowerCase();
      }

      // Actualizar cliente
      const client = await this.clientModel.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      ).exec();

      if (!client) {
        throw new ClienteNoEncontradoException(id);
      }

      // Manejar prepaids si se proporcionan: replace-all SOLO sobre las PENDING.
      // Las CONSUMED se preservan como histórico (auditoría de señas ya
      // aplicadas a ventas), aunque el usuario las haya editado en el form.
      if (updateClientDto.prepaids) {
        await this.prepaidModel.updateMany(
          { clientId: id, status: PrepaidStatus.PENDING, deletedAt: { $exists: false } },
          { deletedAt: new Date() }
        ).exec();

        if (updateClientDto.prepaids.length > 0) {
          const prepaidData = updateClientDto.prepaids.map(prepaid => ({
            ...prepaid,
            clientId: id,
          }));

          await this.prepaidModel.create(prepaidData);
        }
      }

      // Obtener cliente actualizado con prepaids
      return await this.findOne(id);
    } catch (error) {
      if (error instanceof ClienteNoEncontradoException || 
          error instanceof EmailClienteYaExisteException ||
          error instanceof CuitClienteYaExisteException) {
        throw error;
      }
      console.error('Error updating client:', error);
      throw new BadRequestException('Error durante la actualización del cliente');
    }
  }

  async remove(id: string): Promise<void> {
    const client = await this.findOne(id);
    
    // Soft delete del cliente
    await this.clientModel.findByIdAndUpdate(id, {
      deletedAt: new Date()
    }).exec();

    // Soft delete de prepaids del cliente
    await this.prepaidModel.updateMany(
      { clientId: id },
      { deletedAt: new Date() }
    ).exec();
  }

  async getClientPrepaids(clientId: string): Promise<Prepaid[]> {
    const prepaids = await this.prepaidModel.find({
      clientId,
      deletedAt: { $exists: false }
    }).sort({ createdAt: -1 }).exec();

    return prepaids.map(prepaid => this.mapToPrepaidResponse(prepaid));
  }

  async getClientPendingPrepaids(clientId: string): Promise<Prepaid[]> {
    const prepaids = await this.prepaidModel.find({
      clientId,
      status: PrepaidStatus.PENDING,
      deletedAt: { $exists: false }
    }).sort({ createdAt: -1 }).exec();

    return prepaids.map(prepaid => this.mapToPrepaidResponse(prepaid));
  }
}

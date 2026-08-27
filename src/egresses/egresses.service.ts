import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DateTime } from 'luxon';
import {
  CreateEgressDto,
  UpdateEgressDto,
  EgressPaginatedFilterDto,
} from '../common/dto';
import { IEgress, PaginatedResponse } from '../common/interfaces';
import {
  EgressNotFoundException,
  EgressNumberAlreadyExistsException,
  EgressCannotBeUpdatedException,
  EgressCannotBeDeletedException,
  InvalidEgressDataException,
} from '../common/exceptions';
import { Egress, EgressDocument, AuditLog, AuditLogDocument } from '../common/schemas';
import {
  EgressCategory,
  EgressCategoryDocument,
} from '../common/schemas/egress-category.schema';
import {
  CreateEgressCategoryDto,
  UpdateEgressCategoryDto,
} from '../common/dto/egress-category.dto';
import { Types } from 'mongoose';
import { EgressStatus } from '../common/enums';
import { buildDateFilter } from '../common/utils';
import { SettingsService } from '../settings/settings.service';
import { CashboxService } from '../cashbox/cashbox.service';

/**
 * Contexto de quién autoriza y por qué un borrado de egreso. Con cuenta admin
 * compartida, el borrado es sensible: exige PIN o contraseña del admin y deja
 * rastro (motivo + auditoría). Ver [[SettingsService.authorizeSensitiveAction]].
 */
export interface RemoveEgressContext {
  userId?: string;
  userEmail?: string;
  ipAddress?: string;
  reason: string;
  pin?: string;
  adminPassword?: string;
}

@Injectable()
export class EgressesService {
  constructor(
    @InjectModel(Egress.name)
    private readonly egressModel: Model<EgressDocument>,
    @InjectModel(AuditLog.name)
    private readonly auditLogModel: Model<AuditLogDocument>,
    @InjectModel(EgressCategory.name)
    private readonly categoryModel: Model<EgressCategoryDocument>,
    private readonly settingsService: SettingsService,
    private readonly cashboxService: CashboxService,
  ) {}

  private mapToEgressResponse(egress: EgressDocument | any): IEgress {
    // Handle both Mongoose documents and plain objects (from .lean())
    const egressObj = egress.toObject ? egress.toObject() : egress;
    return {
      _id: egressObj._id,
      egressNumber: egressObj.egressNumber,
      concept: egressObj.concept,
      amount: egressObj.amount,
      currency: egressObj.currency,
      type: egressObj.type,
      status: egressObj.status,
      notes: egressObj.notes,
      paymentMethod: egressObj.paymentMethod,
      affectsCashbox: egressObj.affectsCashbox,
      categoryId: egressObj.categoryId?.toString(),
      categoryName: egressObj.categoryName,
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
        deletedAt: null,
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

  // ── Categorías de egreso ──────────────────────────────────────────────────

  /** Categorías básicas que se crean solas la primera vez (editables después). */
  private static readonly DEFAULT_CATEGORIES: Array<{
    name: string;
    color: string;
  }> = [
    { name: 'Sueldos', color: '#455a54' },
    { name: 'Servicios', color: '#5a7d9a' },
    { name: 'Impuestos', color: '#8a6d9a' },
    { name: 'Gastos del día', color: '#9d684e' },
    { name: 'Gastos de cocina', color: '#c2803d' },
    { name: 'Taller', color: '#6d8f5a' },
  ];

  async listCategories(includeInactive = false) {
    // Bootstrap: si nunca se cargó ninguna, sembramos las básicas.
    const total = await this.categoryModel.countDocuments({});
    if (total === 0) {
      await this.categoryModel.insertMany(EgressesService.DEFAULT_CATEGORIES);
    }
    const filter: Record<string, unknown> = { deletedAt: { $exists: false } };
    if (!includeInactive) filter.isActive = true;
    return this.categoryModel.find(filter).sort({ name: 1 }).lean();
  }

  async createCategory(dto: CreateEgressCategoryDto) {
    return this.categoryModel.create({
      name: dto.name,
      color: dto.color,
      isActive: dto.isActive ?? true,
    });
  }

  async updateCategory(id: string, dto: UpdateEgressCategoryDto) {
    const cat = await this.findCategoryOrThrow(id);
    if (dto.name !== undefined) cat.name = dto.name;
    if (dto.color !== undefined) cat.color = dto.color;
    if (dto.isActive !== undefined) cat.isActive = dto.isActive;
    cat.updatedAt = new Date();
    await cat.save();
    return cat;
  }

  async removeCategory(id: string) {
    const cat = await this.findCategoryOrThrow(id);
    cat.deletedAt = new Date();
    cat.isActive = false;
    await cat.save();
    // Los egresos existentes conservan su snapshot de nombre.
    return { success: true };
  }

  private async findCategoryOrThrow(
    id: string,
  ): Promise<EgressCategoryDocument> {
    if (!Types.ObjectId.isValid(id))
      throw new InvalidEgressDataException('categoryId inválido');
    const cat = await this.categoryModel.findById(id).exec();
    if (!cat || cat.deletedAt)
      throw new InvalidEgressDataException('Categoría no encontrada');
    return cat;
  }

  /** Nombre de la categoría para el snapshot, o undefined si no vino. */
  async categorySnapshot(
    categoryId?: string,
  ): Promise<{ categoryId?: Types.ObjectId; categoryName?: string }> {
    if (!categoryId) return {};
    const cat = await this.findCategoryOrThrow(categoryId);
    return {
      categoryId: cat._id as Types.ObjectId,
      categoryName: cat.name,
    };
  }

  async create(createEgressDto: CreateEgressDto): Promise<IEgress> {
    const egressNumber = await this.generateEgressNumber();

    // Validate amount
    if (createEgressDto.amount <= 0) {
      throw new InvalidEgressDataException('El monto debe ser mayor que 0');
    }

    // Create the egress (con snapshot de la categoría, si vino)
    const catSnap = await this.categorySnapshot(createEgressDto.categoryId);
    const createdEgress = new this.egressModel({
      ...createEgressDto,
      ...catSnap,
      egressNumber,
      status: EgressStatus.PENDING,
    });

    await createdEgress.save();
    return this.mapToEgressResponse(createdEgress);
  }

  async findAll(
    filterDto: EgressPaginatedFilterDto,
  ): Promise<PaginatedResponse<IEgress>> {
    const {
      page = 1,
      limit = 10,
      search,
      from,
      to,
      status,
      type,
      currency,
    } = filterDto;
    const skip = (page - 1) * limit;

    // Build the filter - remove deletedAt filter temporarily

    // Build the filter
    const filter: any = { deletedAt: { $exists: false } };

    // Search filter (by concept)
    if (search) {
      filter.$or = [
        { concept: { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } },
        { authorizedBy: { $regex: search, $options: 'i' } },
      ];
    }

    // Date filter
    const dateFilter = buildDateFilter(from, to);
    if (dateFilter && Object.keys(dateFilter).length > 0) {
      filter.createdAt = dateFilter.createdAt;
    }

    // Status filter
    if (status) {
      filter.status = status;
    }

    if (filterDto.categoryId) {
      filter.categoryId = new Types.ObjectId(filterDto.categoryId);
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

    // Debug: Log the results
    console.log(
      'Found egresses:',
      egresses.length,
      'Total with filter:',
      total,
    );
    console.log('Raw egresses:', JSON.stringify(egresses, null, 2));

    const mappedEgresses = egresses.map((egress) =>
      this.mapToEgressResponse(egress as unknown as EgressDocument),
    );

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

    return this.mapToEgressResponse(egress as unknown as EgressDocument);
  }

  async update(id: string, updateEgressDto: UpdateEgressDto): Promise<IEgress> {
    const egress = await this.egressModel.findOne({ _id: id, deletedAt: null });

    if (!egress) {
      throw new EgressNotFoundException(id);
    }

    // Check if egress can be updated
    if (egress.status === EgressStatus.COMPLETED) {
      throw new EgressCannotBeUpdatedException(
        'No se puede modificar un egreso completado',
      );
    }

    // Validate amount if provided
    if (updateEgressDto.amount !== undefined && updateEgressDto.amount <= 0) {
      throw new InvalidEgressDataException('El monto debe ser mayor que 0');
    }

    // Update the egress. Sólo aplicamos los campos realmente enviados: si
    // copiáramos el DTO entero, los campos ausentes (undefined) pisarían
    // valores existentes como `status`, y `save()` fallaría con
    // "Path `status` is required" al revalidar el documento completo.
    const definedFields = Object.fromEntries(
      Object.entries(updateEgressDto).filter(
        ([, value]) => value !== undefined,
      ),
    );
    // La categoría entra con snapshot del nombre (string vacío = quitarla).
    if (updateEgressDto.categoryId !== undefined) {
      delete definedFields.categoryId;
      if (updateEgressDto.categoryId) {
        const snap = await this.categorySnapshot(updateEgressDto.categoryId);
        egress.categoryId = snap.categoryId;
        egress.categoryName = snap.categoryName;
      } else {
        egress.categoryId = undefined;
        egress.categoryName = undefined;
      }
    }
    Object.assign(egress, definedFields);
    egress.updatedAt = new Date();

    await egress.save();
    return this.mapToEgressResponse(egress);
  }

  async remove(id: string, ctx: RemoveEgressContext): Promise<void> {
    const egress = await this.egressModel.findOne({ _id: id, deletedAt: null });

    if (!egress) {
      throw new EgressNotFoundException(id);
    }

    // Autorización: PIN del dueño o, como respaldo, contraseña del admin. El
    // cajero no tiene ninguno, así que no puede borrar aunque comparta el login.
    // Lanza excepción si no autoriza (incluye bloqueo por fuerza bruta del PIN).
    await this.settingsService.authorizeSensitiveAction(
      ctx.userId,
      ctx.pin,
      ctx.adminPassword,
    );

    // A diferencia del borrado casual, una corrección autorizada SÍ puede borrar
    // un egreso COMPLETED (es justo el caso: un egreso ya confirmado de una caja
    // cerrada, cargado por error). El PIN/contraseña es la salvaguarda.

    // Snapshot ANTES de marcar el borrado, para auditoría y para el historial de
    // la caja afectada.
    const snapshot = {
      _id: egress._id,
      egressNumber: egress.egressNumber,
      concept: egress.concept,
      amount: egress.amount,
      currency: egress.currency,
      type: egress.type,
      status: egress.status,
      paymentMethod: egress.paymentMethod,
      createdAt: egress.createdAt,
    };

    // Soft delete
    egress.deletedAt = new Date();
    egress.updatedAt = new Date();
    await egress.save();

    // Ajustar la caja CERRADA afectada (recalcula esperado/discrepancia y deja
    // snapshot en editHistory). El egreso ya tiene deletedAt, así que el
    // recálculo lo excluye. No falla el borrado si esto tiene un problema.
    try {
      await this.cashboxService.handleEgressDeleted(
        snapshot,
        ctx.userId,
        ctx.reason,
      );
    } catch (err) {
      console.error(
        'Error ajustando la caja tras borrar el egreso',
        egress.egressNumber,
        err,
      );
    }

    // Auditoría explícita: guarda el egreso borrado (oldValues) + el motivo.
    // El interceptor global sólo captura newValues, inútil para un DELETE.
    try {
      await this.auditLogModel.create({
        entity: 'Egress',
        entityId: String(egress._id),
        action: 'DELETE',
        userId: ctx.userId ? (ctx.userId as any) : undefined,
        userEmail: ctx.userEmail,
        ipAddress: ctx.ipAddress ?? 'unknown',
        oldValues: snapshot,
        newValues: { reason: ctx.reason, deletedAt: egress.deletedAt },
      });
    } catch (err) {
      console.error('Error registrando auditoría de borrado de egreso', err);
    }
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
      throw new EgressCannotBeUpdatedException(
        'No se puede completar un egreso cancelado',
      );
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
      throw new EgressCannotBeUpdatedException(
        'No se puede cancelar un egreso completado',
      );
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
  async getTotalByPeriod(
    from?: string,
    to?: string,
  ): Promise<{ total: number; currency: string }[]> {
    const filter: any = {
      deletedAt: { $exists: false },
      status: EgressStatus.COMPLETED,
    };

    const dateFilter = buildDateFilter(from, to);
    if (dateFilter && Object.keys(dateFilter).length > 0) {
      filter.createdAt = dateFilter.createdAt;
    }

    const result = await this.egressModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$currency',
          total: { $sum: '$amount' },
        },
      },
      {
        $project: {
          _id: 0,
          currency: '$_id',
          total: 1,
        },
      },
    ]);

    return result;
  }
}

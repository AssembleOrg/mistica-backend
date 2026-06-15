import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { AuditLogDocument } from '../common/schemas/audit-log.schema';

@ApiTags('Auditoría')
@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AuditController {
  constructor(
    @InjectModel('AuditLog') private readonly auditLogModel: Model<AuditLogDocument>,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Obtener logs de auditoría (solo admin)' })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiQuery({ name: 'entity', required: false, type: String })
  @ApiQuery({ name: 'action', required: false, type: String })
  @ApiQuery({ name: 'userEmail', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('entity') entity?: string,
    @Query('action') action?: string,
    @Query('userEmail') userEmail?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '100',
  ) {
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const filter: Record<string, any> = {};
    if (entity) filter.entity = entity;
    if (action) filter.action = action;
    if (userEmail) filter.userEmail = { $regex: userEmail, $options: 'i' };
    if (from || to) {
      filter.timestamp = {};
      if (from) filter.timestamp.$gte = new Date(from);
      if (to) filter.timestamp.$lte = new Date(`${to}T23:59:59`);
    }

    const [logs, total] = await Promise.all([
      this.auditLogModel
        .find(filter)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      this.auditLogModel.countDocuments(filter),
    ]);

    return {
      success: true,
      data: logs.map((l: any) => ({
        id: l._id.toString(),
        entity: l.entity,
        entityId: l.entityId,
        action: l.action,
        userEmail: l.userEmail ?? null,
        ipAddress: l.ipAddress ?? null,
        timestamp: l.timestamp,
        newValues: l.newValues ?? null,
      })),
      meta: {
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }
}

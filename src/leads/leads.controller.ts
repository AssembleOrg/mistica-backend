import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public, Throttle } from '../common/decorators';
import { SimpleThrottleGuard } from '../common/guards/simple-throttle.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CreateLeadDto,
  ListLeadsQueryDto,
  UpdateLeadDto,
} from '../common/dto/lead.dto';
import { UserRole } from '../common/enums/user-role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { LeadsService } from './leads.service';

@ApiTags('Consultas (leads)')
@Controller('leads')
@UseGuards(SimpleThrottleGuard)
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  // ── Público: el bot / la web captan la consulta ──
  @Post()
  @Public()
  @Throttle(5, 60) // máx 5 consultas por IP por minuto (anti-spam de leads)
  @ApiOperation({ summary: 'Crear consulta (lead) para servicios no online' })
  async create(@Body() dto: CreateLeadDto) {
    return this.leadsService.create(dto);
  }

  // ── Admin ──
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar consultas (admin)' })
  async list(@Query() query: ListLeadsQueryDto) {
    return this.leadsService.list(query);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Actualizar estado/datos de una consulta (admin)' })
  async update(@Param('id') id: string, @Body() dto: UpdateLeadDto) {
    return this.leadsService.update(id, dto);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  BlockTableDto,
  CreateShiftTemplateDto,
  DayAgendaQueryDto,
  ReassignTablesDto,
  UpdateShiftTemplateDto,
} from '../common/dto/table.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TablesService } from './tables.service';
import { ShiftsService } from './shifts.service';

@ApiTags('Mesas')
@Controller('tables')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class TablesController {
  constructor(
    private readonly service: TablesService,
    private readonly shifts: ShiftsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar las mesas activas del salón' })
  list() {
    return this.service.listTables();
  }

  @Get('shifts')
  @ApiOperation({ summary: 'Turnos vigentes hoy (o de una fecha)' })
  shiftsToday(@Query('date') date?: string) {
    return date ? this.shifts.forDate(date) : this.service.listShifts();
  }

  // ── Plantillas de turno (lo que el equipo edita una sola vez) ──

  @Get('shift-templates')
  @ApiOperation({
    summary:
      'Plantillas de turno del día. Definen los bloques sin cargar turno por turno ni por experiencia.',
  })
  listTemplates() {
    return this.shifts.listAll();
  }

  @Post('shift-templates')
  @ApiOperation({ summary: 'Crear una plantilla de turno' })
  createTemplate(@Body() dto: CreateShiftTemplateDto) {
    return this.shifts.create(dto);
  }

  @Patch('shift-templates/:id')
  @ApiOperation({ summary: 'Editar una plantilla de turno' })
  updateTemplate(@Param('id') id: string, @Body() dto: UpdateShiftTemplateDto) {
    return this.shifts.update(id, dto);
  }

  @Delete('shift-templates/:id')
  @ApiOperation({ summary: 'Eliminar una plantilla de turno' })
  removeTemplate(@Param('id') id: string) {
    return this.shifts.remove(id);
  }

  @Get('agenda')
  @ApiOperation({
    summary: 'Agenda de mesas de un día: turnos con el estado de cada mesa',
  })
  agenda(@Query() query: DayAgendaQueryDto) {
    return this.service.dayAgenda(query.date);
  }

  @Post('reassign')
  @ApiOperation({
    summary: 'Cambiar a mano las mesas de una reserva desde la agenda',
  })
  reassign(@Body() dto: ReassignTablesDto) {
    return this.service.reassign(dto.reservationId, dto.tables);
  }

  @Post('block')
  @ApiOperation({
    summary: 'Bloquear una mesa en un turno (taller, evento, mesa rota)',
  })
  async block(@Body() dto: BlockTableDto) {
    await this.service.blockTable({
      dateKey: dto.date,
      shiftKey: dto.shift,
      code: dto.code,
      label: dto.label,
    });
    return { success: true };
  }

  @Post('unblock')
  @ApiOperation({ summary: 'Quitar un bloqueo manual de mesa' })
  async unblock(@Body() dto: BlockTableDto) {
    await this.service.unblockTable({
      dateKey: dto.date,
      shiftKey: dto.shift,
      code: dto.code,
    });
    return { success: true };
  }
}

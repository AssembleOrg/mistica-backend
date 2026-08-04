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
  CreateRecurringBlockDto,
  CreateShiftTemplateDto,
  DayAgendaQueryDto,
  ReassignTablesDto,
  UpdateRecurringBlockDto,
  UpdateShiftTemplateDto,
} from '../common/dto/table.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TablesService } from './tables.service';
import { ShiftsService } from './shifts.service';
import { RecurringBlocksService } from './recurring-blocks.service';

@ApiTags('Mesas')
@Controller('tables')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class TablesController {
  constructor(
    private readonly service: TablesService,
    private readonly shifts: ShiftsService,
    private readonly recurring: RecurringBlocksService,
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

  // ── Bloqueos fijos semanales (taller, colonia, eventos que se repiten) ──

  @Get('recurring-blocks')
  @ApiOperation({
    summary:
      'Bloqueos fijos semanales de mesas. Ocupan mesas todas las semanas en un día y rango horario.',
  })
  listRecurring() {
    return this.recurring.listAll();
  }

  @Post('recurring-blocks')
  @ApiOperation({ summary: 'Crear un bloqueo fijo semanal' })
  createRecurring(@Body() dto: CreateRecurringBlockDto) {
    return this.recurring.create(dto);
  }

  @Patch('recurring-blocks/:id')
  @ApiOperation({ summary: 'Editar un bloqueo fijo semanal' })
  updateRecurring(
    @Param('id') id: string,
    @Body() dto: UpdateRecurringBlockDto,
  ) {
    return this.recurring.update(id, dto);
  }

  @Delete('recurring-blocks/:id')
  @ApiOperation({ summary: 'Eliminar un bloqueo fijo semanal' })
  removeRecurring(@Param('id') id: string) {
    return this.recurring.remove(id);
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
    summary:
      'Bloquear una o varias mesas en un rango horario (taller, evento, mesa rota). Todo-o-nada.',
  })
  async block(@Body() dto: BlockTableDto) {
    const range = this.blockRange(dto);
    await this.service.blockTable({
      dateKey: dto.date,
      codes: dto.codes?.length ? dto.codes : dto.code ? [dto.code] : [],
      label: dto.label,
      start: range.start,
      end: range.end,
    });
    return { success: true };
  }

  @Post('unblock')
  @ApiOperation({ summary: 'Quitar un bloqueo manual de mesa' })
  async unblock(@Body() dto: BlockTableDto) {
    const range = this.blockRange(dto);
    const codes = dto.codes?.length ? dto.codes : dto.code ? [dto.code] : [];
    for (const code of codes) {
      await this.service.unblockTable({
        dateKey: dto.date,
        code,
        start: range.start,
      });
    }
    return { success: true };
  }

  /**
   * Rango horario de un bloqueo: start/end explícitos, o el rango del turno
   * sugerido si el front viejo todavía manda `shift`.
   */
  private blockRange(dto: BlockTableDto): { start?: string; end?: string } {
    if (dto.start || dto.end) return { start: dto.start, end: dto.end };
    if (!dto.shift) return {};
    const shift = this.shifts
      .forDate(dto.date)
      .find((s) => s.key === dto.shift?.toUpperCase());
    return shift ? { start: shift.start, end: shift.end } : {};
  }
}

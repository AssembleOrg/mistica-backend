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
import { Public } from '../common/decorators';
import { Roles } from '../common/decorators/roles.decorator';
import { GenerateSessionsDto, UpdateSessionDto } from '../common/dto';
import { SessionStatus, UserRole } from '../common/enums';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ReservationsService } from '../reservations/reservations.service';
import { ExperiencesService } from './experiences.service';

@ApiTags('Turnos')
@Controller('experience-sessions')
export class ExperienceSessionsController {
  constructor(
    private readonly experiencesService: ExperiencesService,
    private readonly reservationsService: ReservationsService,
  ) {}

  // ── Público (landing): turnos OPEN futuros ──
  @Get('public')
  @Public()
  @ApiOperation({ summary: 'Turnos disponibles (público)' })
  async listPublic(
    @Query('experienceId') experienceId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.experiencesService.listSessions({
      experienceId,
      from,
      to,
      status: SessionStatus.OPEN,
    });
  }

  // ── Admin ──
  @Post('generate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generar turnos en lote (repetir carga)' })
  async generate(@Body() dto: GenerateSessionsDto) {
    return this.experiencesService.generateSessions(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar turnos (admin)' })
  async list(
    @Query('experienceId') experienceId?: string,
    @Query('status') status?: SessionStatus,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('includePast') includePast?: string,
  ) {
    return this.experiencesService.listSessions({
      experienceId,
      status,
      from,
      to,
      includePast: includePast === 'true',
    });
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async get(@Param('id') id: string) {
    return this.experiencesService.getSession(id);
  }

  @Get(':id/attendees')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Anotados de un turno' })
  async attendees(@Param('id') id: string) {
    const session = await this.experiencesService.getSession(id);
    const reservations = await this.reservationsService.listBySession(id);
    return { session, reservations };
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  async update(@Param('id') id: string, @Body() dto: UpdateSessionDto) {
    return this.experiencesService.updateSession(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  async remove(@Param('id') id: string) {
    return this.experiencesService.deleteSession(id);
  }
}

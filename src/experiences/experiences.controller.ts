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
import { Public, AllowedViews } from '../common/decorators';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateExperienceDto, UpdateExperienceDto } from '../common/dto';
import { UserRole } from '../common/enums/user-role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ExperiencesService } from './experiences.service';
import { AvailabilityService } from '../reservations/availability.service';
import { AllowedViewsGuard } from '../common/guards/allowed-views.guard';

@ApiTags('Experiencias')
@Controller('experiences')
@UseGuards(JwtAuthGuard, AllowedViewsGuard)
@AllowedViews('reservas')
export class ExperiencesController {
  constructor(
    private readonly experiencesService: ExperiencesService,
    private readonly availability: AvailabilityService,
  ) {}

  // ── Público (landing) ──
  @Get('public')
  @Public()
  @ApiOperation({ summary: 'Experiencias activas (público)' })
  async listPublic() {
    return this.experiencesService.listPublicExperiences();
  }

  // ── Admin ──
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crear experiencia' })
  async create(@Body() dto: CreateExperienceDto) {
    return this.experiencesService.createExperience(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar experiencias (admin)' })
  async list(@Query('includeInactive') includeInactive?: string) {
    return this.experiencesService.listExperiences(includeInactive === 'true');
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async get(@Param('id') id: string) {
    return this.experiencesService.getExperience(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiBearerAuth()
  async update(@Param('id') id: string, @Body() dto: UpdateExperienceDto) {
    const updated = await this.experiencesService.updateExperience(id, dto);
    // Los turnos ya creados (de hoy en adelante) toman el cupo nuevo.
    await this.availability.syncFutureCapacity(id);
    return updated;
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  async remove(@Param('id') id: string) {
    return this.experiencesService.deleteExperience(id);
  }
}

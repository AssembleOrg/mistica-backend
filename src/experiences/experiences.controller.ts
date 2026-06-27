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
import { CreateExperienceDto, UpdateExperienceDto } from '../common/dto';
import { UserRole } from '../common/enums/user-role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ExperiencesService } from './experiences.service';

@ApiTags('Experiencias')
@Controller('experiences')
export class ExperiencesController {
  constructor(private readonly experiencesService: ExperiencesService) {}

  // ── Público (landing) ──
  @Get('public')
  @Public()
  @ApiOperation({ summary: 'Experiencias activas (público)' })
  async listPublic() {
    return this.experiencesService.listExperiences(false);
  }

  // ── Admin ──
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
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
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  async update(@Param('id') id: string, @Body() dto: UpdateExperienceDto) {
    return this.experiencesService.updateExperience(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  async remove(@Param('id') id: string) {
    return this.experiencesService.deleteExperience(id);
  }
}

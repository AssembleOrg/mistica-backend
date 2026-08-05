import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CreateProfessorDto,
  UpdateProfessorDto,
} from '../common/dto/professor.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProfessorsService } from './professors.service';

@ApiTags('Profesores')
@Controller('professors')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ProfessorsController {
  constructor(private readonly service: ProfessorsService) {}

  // El listado lo necesita también la vista de piezas (cuentas comunes con la
  // pestaña habilitada), para mostrar y filtrar por profesor.
  @Get()
  @ApiOperation({ summary: 'Listar profesores' })
  list() {
    return this.service.list();
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear un profesor' })
  create(@Body() dto: CreateProfessorDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Editar un profesor' })
  update(@Param('id') id: string, @Body() dto: UpdateProfessorDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Eliminar un profesor (soft delete)' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

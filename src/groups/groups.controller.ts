import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateGroupDto, UpdateGroupDto } from '../common/dto/group.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { GroupsService, Actor } from './groups.service';
import { AllowedViews } from '../common/decorators';
import { AllowedViewsGuard } from '../common/guards/allowed-views.guard';

interface AuthRequest extends Request {
  user?: Actor;
}

/**
 * Grupos / talleres / clases. Autenticado alcanza: el service decide qué ve y
 * qué puede tocar cada uno (admin: todo; profesor: sólo sus grupos).
 */
@ApiTags('Grupos')
@Controller('groups')
@UseGuards(JwtAuthGuard, AllowedViewsGuard)
@ApiBearerAuth()
@AllowedViews('alumnos')
export class GroupsController {
  constructor(private readonly service: GroupsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar grupos (profesor: sólo los suyos)' })
  list(
    @Req() req: AuthRequest,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.service.list(req.user, includeInactive === 'true');
  }

  @Get('of-student/:studentId')
  @ApiOperation({ summary: 'Grupos en los que cursa un alumno' })
  ofStudent(@Param('studentId') studentId: string, @Req() req: AuthRequest) {
    return this.service.groupsOfStudent(studentId, req.user);
  }

  @Post()
  @ApiOperation({ summary: 'Crear grupo (profesor: queda a su nombre)' })
  create(@Body() dto: CreateGroupDto, @Req() req: AuthRequest) {
    return this.service.create(dto, req.user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar grupo' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateGroupDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.update(id, dto, req.user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar grupo (soft delete)' })
  remove(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.service.remove(id, req.user);
  }
}

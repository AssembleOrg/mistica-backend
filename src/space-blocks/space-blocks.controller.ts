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
import { SpaceBlocksService } from './space-blocks.service';
import { CreateSpaceBlockDto, UpdateSpaceBlockDto } from '../common/dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { AllowedViewsGuard } from '../common/guards/allowed-views.guard';
import { AllowedViews } from '../common/decorators';

@ApiTags('Bloqueos de espacio')
@Controller('space-blocks')
@UseGuards(JwtAuthGuard, AllowedViewsGuard)
@AllowedViews('reservas')
@ApiBearerAuth()
export class SpaceBlocksController {
  constructor(private readonly service: SpaceBlocksService) {}

  @Get()
  @ApiOperation({ summary: 'Listar bloqueos de espacio (talleres/eventos)' })
  list() {
    return this.service.list();
  }

  @Post()
  @ApiOperation({ summary: 'Crear un bloqueo de espacio' })
  create(@Body() dto: CreateSpaceBlockDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un bloqueo de espacio' })
  update(@Param('id') id: string, @Body() dto: UpdateSpaceBlockDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un bloqueo de espacio' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

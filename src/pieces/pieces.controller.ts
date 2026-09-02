import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PiecesService } from './pieces.service';
import {
  CreatePieceDto,
  UpdatePieceDto,
  ListPiecesQueryDto,
} from '../common/dto';
import { SetPieceStatusesDto } from '../common/dto/piece.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { Public } from '../common/decorators';
import { AllowedViews } from '../common/decorators';
import { AllowedViewsGuard } from '../common/guards/allowed-views.guard';
import { envConfig } from '../config/env.config';

@ApiTags('Piezas')
@Controller('pieces')
@UseGuards(JwtAuthGuard, AllowedViewsGuard)
@ApiBearerAuth()
@AllowedViews('reservas:piezas')
export class PiecesController {
  constructor(private readonly piecesService: PiecesService) {}

  // Uso INTERNO del bot: piezas del cliente por su propio teléfono. Mismo
  // secreto compartido bot↔backend. Va ANTES de las rutas admin.
  @Get('by-phone')
  @Public()
  @AllowedViews()
  @ApiOperation({ summary: 'Piezas del cliente por teléfono (interno del bot)' })
  async byPhone(
    @Query('phone') phone: string,
    @Headers('x-bot-secret') secret?: string,
  ) {
    const expected = envConfig.botControl.secret;
    if (!expected || secret !== expected) {
      throw new UnauthorizedException('No autorizado');
    }
    return this.piecesService.byPhone(phone || '');
  }

  // Estados CONFIGURABLES del proceso (Fresco, En proceso, Horneado…). La
  // lista la ven todas las cuentas con la vista de piezas; editarla es cosa
  // del admin (guard por rol en el service no: acá, vía Roles en el front —
  // el backend valida admin en el PUT del módulo de abajo).
  @Get('statuses')
  @ApiOperation({ summary: 'Estados vigentes de las piezas (configurables)' })
  statuses() {
    return this.piecesService.statusConfig();
  }

  @Patch('statuses')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Reemplazar los estados de pieza (adaptables al taller)',
  })
  setStatuses(@Body() dto: SetPieceStatusesDto) {
    return this.piecesService.setStatusConfig(dto.statuses);
  }

  @Post()
  @ApiOperation({ summary: 'Crear una pieza (admin)' })
  create(@Body() dto: CreatePieceDto) {
    return this.piecesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar piezas (admin)' })
  list(@Query() query: ListPiecesQueryDto) {
    return this.piecesService.list(query);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar / avanzar estado de una pieza (admin)' })
  update(@Param('id') id: string, @Body() dto: UpdatePieceDto) {
    return this.piecesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Eliminar (soft) una pieza (admin)' })
  remove(@Param('id') id: string) {
    return this.piecesService.remove(id);
  }
}

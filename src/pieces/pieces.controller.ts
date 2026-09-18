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
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PiecesService } from './pieces.service';
import {
  CreatePieceDto,
  CreateReservationPiecesDto,
  UpdatePieceDto,
  ListPiecesQueryDto,
} from '../common/dto';
import { SetPieceStatusesDto } from '../common/dto/piece.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { Public, AllowedViews } from '../common/decorators';
import { AllowedViewsGuard } from '../common/guards/allowed-views.guard';
import { envConfig } from '../config/env.config';
import { Request } from 'express';

interface AuthRequest extends Request {
  user?: { id: string; role?: string };
}

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

  // Flujo fijo y deliberadamente corto: en preparación, lista y retirada.
  @Get('statuses')
  @ApiOperation({ summary: 'Estados vigentes del flujo simplificado de piezas' })
  statuses() {
    return this.piecesService.statusConfig();
  }

  @Patch('statuses')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Intentar reemplazar estados (flujo fijo)' })
  setStatuses(@Body() dto: SetPieceStatusesDto) {
    return this.piecesService.setStatusConfig(dto.statuses);
  }

  @Post()
  @ApiOperation({ summary: 'Crear una pieza (admin)' })
  create(@Body() dto: CreatePieceDto) {
    return this.piecesService.create(dto);
  }

  @Post('reservation-batch')
  @ApiOperation({ summary: 'Registrar las fichas de piezas de una reserva' })
  createReservationBatch(
    @Body() dto: CreateReservationPiecesDto,
    @Req() req: AuthRequest,
  ) {
    return this.piecesService.createReservationBatch(dto, req.user);
  }

  @Get()
  @ApiOperation({ summary: 'Listar piezas (admin)' })
  list(@Query() query: ListPiecesQueryDto) {
    return this.piecesService.list(query);
  }

  @Get('counts')
  @ApiOperation({ summary: 'Contar piezas por estado' })
  counts(@Query() query: ListPiecesQueryDto) {
    return this.piecesService.counts(query);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar una pieza o marcarla lista' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePieceDto,
    @Req() req: AuthRequest,
  ) {
    return this.piecesService.update(id, dto, req.user);
  }

  @Post(':id/notify-ready')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Enviar manualmente el aviso de retiro' })
  notifyReady(@Param('id') id: string) {
    return this.piecesService.notifyReadyByAdmin(id);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Eliminar (soft) una pieza (admin)' })
  remove(@Param('id') id: string) {
    return this.piecesService.remove(id);
  }
}

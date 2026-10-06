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
  CreateGroupPiecesDto,
  UpdatePieceDto,
  ListPiecesQueryDto,
} from '../common/dto';
import {
  SavePieceExtraDto,
  SavePieceTypeDto,
  SetPieceStatusesDto,
} from '../common/dto/piece.dto';
import { PieceTypesService } from './piece-types.service';
import { PieceExtrasService } from './piece-extras.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole, canManage } from '../common/enums/user-role.enum';
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
  constructor(
    private readonly piecesService: PiecesService,
    private readonly pieceTypes: PieceTypesService,
    private readonly pieceExtras: PieceExtrasService,
  ) {}

  // Uso INTERNO del bot: piezas del cliente por su propio teléfono. Mismo
  // secreto compartido bot↔backend. Va ANTES de las rutas admin.
  @Get('by-phone')
  @Public()
  @AllowedViews()
  @ApiOperation({
    summary: 'Piezas del cliente por teléfono (interno del bot)',
  })
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
  @ApiOperation({
    summary: 'Estados vigentes del flujo simplificado de piezas',
  })
  statuses() {
    return this.piecesService.statusConfig();
  }

  @Patch('statuses')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Intentar reemplazar estados (flujo fijo)' })
  setStatuses(@Body() dto: SetPieceStatusesDto) {
    return this.piecesService.setStatusConfig(dto.statuses);
  }

  // Catálogo de piezas para el selector de "Pieza elegida".
  @Get('types')
  // También lo usa la pieza del mes de los alumnos (y Producción la lee).
  @AllowedViews('reservas:piezas', 'alumnos', 'produccion')
  @ApiOperation({ summary: 'Catálogo de piezas (taza, bowl, plato…)' })
  listTypes() {
    return this.pieceTypes.list();
  }

  @Post('types')
  @ApiOperation({ summary: 'Agregar una pieza al catálogo' })
  createType(@Body() dto: SavePieceTypeDto, @Req() req: AuthRequest) {
    // La categoría define el adicional que se cobra: la pone admin/encargado.
    return this.pieceTypes.create(
      dto.name,
      canManage(req.user?.role) ? dto.extraId : undefined,
    );
  }

  @Patch('types/:id')
  @ApiOperation({ summary: 'Renombrar una pieza del catálogo' })
  updateType(
    @Param('id') id: string,
    @Body() dto: SavePieceTypeDto,
    @Req() req: AuthRequest,
  ) {
    return this.pieceTypes.update(
      id,
      dto.name,
      canManage(req.user?.role) ? dto.extraId : undefined,
    );
  }

  @Delete('types/:id')
  @ApiOperation({
    summary: 'Quitar una pieza del catálogo (las fichas ya cargadas no cambian)',
  })
  removeType(@Param('id') id: string) {
    return this.pieceTypes.remove(id);
  }

  // Adicionales de pieza (Incluida, Estándar, Premium…): los ve quien carga
  // fichas; los precios los toca sólo el admin porque impactan en la reserva.
  @Get('extras')
  @AllowedViews('reservas:piezas', 'alumnos', 'produccion')
  @ApiOperation({ summary: 'Catálogo de adicionales de pieza' })
  listExtras() {
    return this.pieceExtras.list();
  }

  @Post('extras')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Agregar un adicional de pieza' })
  createExtra(@Body() dto: SavePieceExtraDto) {
    return this.pieceExtras.create(dto.name, dto.amount, dto.pair);
  }

  @Patch('extras/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Editar título o monto de un adicional' })
  updateExtra(@Param('id') id: string, @Body() dto: SavePieceExtraDto) {
    return this.pieceExtras.update(id, dto.name, dto.amount, dto.pair);
  }

  @Delete('extras/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({
    summary: 'Quitar un adicional (lo ya cargado en reservas no cambia)',
  })
  removeExtra(@Param('id') id: string) {
    return this.pieceExtras.remove(id);
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

  @Post('group-batch')
  @ApiOperation({
    summary: 'Registrar las fichas de piezas de un grupo de taller',
  })
  createGroupBatch(@Body() dto: CreateGroupPiecesDto, @Req() req: AuthRequest) {
    return this.piecesService.createGroupBatch(dto, req.user);
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
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
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

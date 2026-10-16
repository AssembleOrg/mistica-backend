import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
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
  ImportPieceCatalogDto,
  SavePieceExtraDto,
  SavePieceTypeDto,
  BulkPieceStatusDto,
  PieceTallyQueryDto,
  PieceDraftsQueryDto,
  SetPieceColorsDto,
  SavePieceDraftEntryDto,
  SetPieceStatusesDto,
} from '../common/dto/piece.dto';
import { PieceTypesService } from './piece-types.service';
import { PieceExtrasService } from './piece-extras.service';
import { PieceDraftsService } from './piece-drafts.service';
import { PieceColorsService } from './piece-colors.service';
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
    private readonly drafts: PieceDraftsService,
    private readonly pieceColors: PieceColorsService,
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

  @Get('colors')
  @AllowedViews('reservas:piezas', 'alumnos', 'produccion')
  @ApiOperation({ summary: 'Paleta de colores de las fichas' })
  colors() {
    return this.pieceColors.get();
  }

  @Put('colors')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Editar la paleta de colores de las fichas' })
  setColors(@Body() dto: SetPieceColorsDto) {
    return this.pieceColors.set(dto.colors);
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
    return this.pieceExtras.create(dto.name, dto.amount, dto.pair, {
      addAmount: dto.addAmount,
      material: dto.material,
    });
  }

  @Patch('extras/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Editar título o monto de un adicional' })
  updateExtra(@Param('id') id: string, @Body() dto: SavePieceExtraDto) {
    return this.pieceExtras.update(id, dto.name, dto.amount, dto.pair, {
      addAmount: dto.addAmount,
      material: dto.material,
    });
  }

  @Post('catalog/import')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({
    summary: 'Importar el catálogo de piezas y categorías (crea o actualiza por nombre, no borra)',
  })
  importCatalog(@Body() dto: ImportPieceCatalogDto) {
    return this.pieceTypes.importCatalog(dto);
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
  async createReservationBatch(
    @Body() dto: CreateReservationPiecesDto,
    @Req() req: AuthRequest,
  ) {
    const pieces = await this.piecesService.createReservationBatch(dto, req.user);
    // Las fichas registradas salen del borrador.
    await this.drafts.remove(dto.reservationId, dto.draftKeys ?? []);
    return pieces;
  }

  @Get('drafts')
  @ApiOperation({ summary: 'Fichas sin terminar por reserva' })
  draftsPending(@Query() query: PieceDraftsQueryDto) {
    return this.drafts.pending(query.reservationIds.split(','));
  }

  @Get('drafts/:reservationId')
  @ApiOperation({ summary: 'Borrador de las fichas de una reserva' })
  draft(@Param('reservationId') reservationId: string) {
    return this.drafts.get(reservationId);
  }

  @Put('drafts/:reservationId/:key')
  @ApiOperation({ summary: 'Guardar una ficha del borrador (autoguardado)' })
  saveDraftEntry(
    @Param('reservationId') reservationId: string,
    @Param('key') key: string,
    @Body() dto: SavePieceDraftEntryDto,
  ) {
    return this.drafts.save(reservationId, key, dto);
  }

  @Delete('drafts/:reservationId/:key')
  @ApiOperation({ summary: 'Quitar una ficha del borrador' })
  removeDraftEntry(
    @Param('reservationId') reservationId: string,
    @Param('key') key: string,
  ) {
    return this.drafts.remove(reservationId, [key]);
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

  @Get('assembly')
  @ApiOperation({
    summary: 'Armado de pedidos: grupos con piezas horneadas o listas',
  })
  assembly() {
    return this.piecesService.assembly();
  }

  @Get('production-tally')
  @AllowedViews('reservas:piezas', 'produccion')
  @ApiOperation({
    summary: 'Piezas elegidas por tipo en la semana o el mes (para reponer)',
  })
  productionTally(@Query() q: PieceTallyQueryDto) {
    return this.piecesService.productionTally(q.period ?? 'week', q.date);
  }

  @Get('counts')
  @ApiOperation({ summary: 'Contar piezas por estado' })
  counts(@Query() query: ListPiecesQueryDto) {
    return this.piecesService.counts(query);
  }

  // Va ANTES de ':id' para que no lo capture.
  @Patch('bulk-status')
  @ApiOperation({ summary: 'Cambiar el estado de varias piezas a la vez' })
  bulkStatus(@Body() dto: BulkPieceStatusDto, @Req() req: AuthRequest) {
    return this.piecesService.bulkStatus(dto.ids, dto.status, req.user);
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

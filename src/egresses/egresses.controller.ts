import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { EgressesService } from './egresses.service';
import { CreateEgressDto, UpdateEgressDto, EgressPaginatedFilterDto } from '../common/dto';
import { IEgress, PaginatedResponse } from '../common/interfaces';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { EgressStatus, EgressType, Currency } from '../common/enums';

@ApiTags('Egresos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('egresses')
export class EgressesController {
  constructor(private readonly egressesService: EgressesService) {}

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo egreso' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Egreso creado exitosamente',
    type: Object, // You could create a proper response DTO here
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Datos de entrada inválidos',
  })
  async create(@Body() createEgressDto: CreateEgressDto): Promise<IEgress> {
    return this.egressesService.create(createEgressDto);
  }

  @Get('all')
  @ApiOperation({ summary: 'Obtener lista paginada de egresos con filtros' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Número de página' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Límite de elementos por página' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Búsqueda por concepto, notas o autorizado por' })
  @ApiQuery({ name: 'from', required: false, type: String, description: 'Fecha de inicio (YYYY-MM-DD)' })
  @ApiQuery({ name: 'to', required: false, type: String, description: 'Fecha de fin (YYYY-MM-DD)' })
  @ApiQuery({ name: 'status', required: false, enum: EgressStatus, description: 'Filtrar por estado' })
  @ApiQuery({ name: 'type', required: false, enum: EgressType, description: 'Filtrar por tipo' })
  @ApiQuery({ name: 'currency', required: false, enum: Currency, description: 'Filtrar por moneda' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lista de egresos obtenida exitosamente',
    type: Object, // You could create a proper paginated response DTO here
  })
  async findAll(@Query() query: EgressPaginatedFilterDto): Promise<PaginatedResponse<IEgress>> {
    return this.egressesService.findAll(query);
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Obtener estadísticas de egresos por período' })
  @ApiQuery({ name: 'from', required: false, type: String, description: 'Fecha de inicio (YYYY-MM-DD)' })
  @ApiQuery({ name: 'to', required: false, type: String, description: 'Fecha de fin (YYYY-MM-DD)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Estadísticas obtenidas exitosamente',
    type: Object,
  })
  async getStatistics(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<{ total: number; currency: string }[]> {
    return this.egressesService.getTotalByPeriod(from, to);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un egreso por ID' })
  @ApiParam({ name: 'id', description: 'ID del egreso' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Egreso encontrado exitosamente',
    type: Object,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Egreso no encontrado',
  })
  async findOne(@Param('id') id: string): Promise<IEgress> {
    return this.egressesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un egreso' })
  @ApiParam({ name: 'id', description: 'ID del egreso' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Egreso actualizado exitosamente',
    type: Object,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Egreso no encontrado',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'El egreso no puede ser actualizado',
  })
  async update(
    @Param('id') id: string,
    @Body() updateEgressDto: UpdateEgressDto,
  ): Promise<IEgress> {
    return this.egressesService.update(id, updateEgressDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un egreso (soft delete)' })
  @ApiParam({ name: 'id', description: 'ID del egreso' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Egreso eliminado exitosamente',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Egreso no encontrado',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'El egreso no puede ser eliminado',
  })
  async remove(@Param('id') id: string): Promise<void> {
    return this.egressesService.remove(id);
  }

  @Patch(':id/complete')
  @ApiOperation({ summary: 'Marcar un egreso como completado' })
  @ApiParam({ name: 'id', description: 'ID del egreso' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Egreso completado exitosamente',
    type: Object,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Egreso no encontrado',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'El egreso no puede ser completado',
  })
  async complete(@Param('id') id: string): Promise<IEgress> {
    return this.egressesService.complete(id);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancelar un egreso' })
  @ApiParam({ name: 'id', description: 'ID del egreso' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Egreso cancelado exitosamente',
    type: Object,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Egreso no encontrado',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'El egreso no puede ser cancelado',
  })
  async cancel(@Param('id') id: string): Promise<IEgress> {
    return this.egressesService.cancel(id);
  }
}
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { PrepaidsService } from './prepaids.service';
import { CreatePrepaidDto, PaginationDto } from '../common/dto';
import { PrepaidPaginationDto } from '../common/dto/prepaid-pagination.dto';
import { Prepaid, PaginatedResponse } from '../common/interfaces';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Auditory } from '../common/decorators';

@ApiTags('Prepaids')
@Controller('prepaids')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PrepaidsController {
  constructor(private readonly prepaidsService: PrepaidsService) {}

  @Post(':clientId')
  @Auditory({ entity: 'Prepaid', action: 'CREATE' })
  @ApiOperation({ summary: 'Crear nuevo prepaid para un cliente' })
  @ApiParam({ name: 'clientId', description: 'ID del cliente' })
  @ApiResponse({ status: 201, description: 'Prepaid creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado' })
  async create(
    @Param('clientId') clientId: string,
    @Body() createPrepaidDto: CreatePrepaidDto,
  ): Promise<{ success: boolean; message: string; data: Prepaid }> {
    const prepaid = await this.prepaidsService.create(createPrepaidDto, clientId);
    return {
      success: true,
      message: 'Prepaid creado exitosamente',
      data: prepaid,
    };
  }

  @Get('paginated')
  @ApiOperation({ summary: 'Obtener todos los prepaids con paginación' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Número de página' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Límite por página' })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'CONSUMED'], description: 'Filtrar por status' })
  @ApiResponse({ status: 200, description: 'Lista de prepaids obtenida exitosamente' })
  async findAllPaginated(@Query() paginationDto: PrepaidPaginationDto): Promise<{ success: boolean; message: string; data: PaginatedResponse<Prepaid> }> {
    const result = await this.prepaidsService.findAll(paginationDto);
    return {
      success: true,
      message: 'Prepaids obtenidos exitosamente',
      data: result,
    };
  }

  @Get('all')
  @ApiOperation({ summary: 'Obtener todos los prepaids sin paginación' })
  @ApiResponse({ status: 200, description: 'Lista completa de prepaids obtenida exitosamente' })
  async findAllWithoutPagination(): Promise<{ success: boolean; message: string; data: Prepaid[] }> {
    const prepaids = await this.prepaidsService.findWithoutPagination();
    return {
      success: true,
      message: 'Prepaids obtenidos exitosamente',
      data: prepaids,
    };
  }

  @Get('status')
  @ApiOperation({ summary: 'Obtener prepaids filtrados por status con paginación' })
  @ApiQuery({ name: 'status', required: true, enum: ['PENDING', 'CONSUMED'], description: 'Status del prepaid' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Número de página' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Límite por página' })
  @ApiResponse({ status: 200, description: 'Prepaids filtrados por status obtenidos exitosamente' })
  @ApiResponse({ status: 400, description: 'Status requerido' })
  async findByStatus(@Query() paginationDto: PrepaidPaginationDto): Promise<{ success: boolean; message: string; data: PaginatedResponse<Prepaid> }> {
    const result = await this.prepaidsService.findByStatus(paginationDto);
    return {
      success: true,
      message: 'Prepaids filtrados por status obtenidos exitosamente',
      data: result,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener prepaid por ID' })
  @ApiParam({ name: 'id', description: 'ID del prepaid' })
  @ApiResponse({ status: 200, description: 'Prepaid encontrado exitosamente' })
  @ApiResponse({ status: 404, description: 'Prepaid no encontrado' })
  async findOne(@Param('id') id: string): Promise<{ success: boolean; message: string; data: Prepaid }> {
    const prepaid = await this.prepaidsService.findOne(id);
    return {
      success: true,
      message: 'Prepaid obtenido exitosamente',
      data: prepaid,
    };
  }

  @Get('client/:clientId')
  @ApiOperation({ summary: 'Obtener prepaids de un cliente' })
  @ApiParam({ name: 'clientId', description: 'ID del cliente' })
  @ApiResponse({ status: 200, description: 'Prepaids del cliente obtenidos exitosamente' })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado' })
  async findByClientId(@Param('clientId') clientId: string): Promise<{ success: boolean; message: string; data: Prepaid[] }> {
    const prepaids = await this.prepaidsService.findByClientId(clientId);
    return {
      success: true,
      message: 'Prepaids del cliente obtenidos exitosamente',
      data: prepaids,
    };
  }

  @Get('client/:clientId/pending')
  @ApiOperation({ summary: 'Obtener prepaids pendientes de un cliente' })
  @ApiParam({ name: 'clientId', description: 'ID del cliente' })
  @ApiResponse({ status: 200, description: 'Prepaids pendientes obtenidos exitosamente' })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado' })
  async findPendingByClientId(@Param('clientId') clientId: string): Promise<{ success: boolean; message: string; data: Prepaid[] }> {
    const prepaids = await this.prepaidsService.findPendingByClientId(clientId);
    return {
      success: true,
      message: 'Prepaids pendientes obtenidos exitosamente',
      data: prepaids,
    };
  }

  @Get('client/:clientId/total')
  @ApiOperation({ summary: 'Obtener monto total de prepaids pendientes de un cliente' })
  @ApiParam({ name: 'clientId', description: 'ID del cliente' })
  @ApiResponse({ status: 200, description: 'Monto total obtenido exitosamente' })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado' })
  async getClientTotalPrepaidAmount(@Param('clientId') clientId: string): Promise<{ success: boolean; message: string; data: { total: number } }> {
    const total = await this.prepaidsService.getClientTotalPrepaidAmount(clientId);
    return {
      success: true,
      message: 'Monto total obtenido exitosamente',
      data: { total },
    };
  }
}

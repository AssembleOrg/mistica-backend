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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { ClientsService } from './clients.service';
import { CreateClientDto, UpdateClientDto, PaginatedDateFilterDto } from '../common/dto';
import { Client, ClientWithPrepaids, PaginatedResponse } from '../common/interfaces';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Auditory } from '../common/decorators';

@ApiTags('Clientes')
@Controller('clients')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  @Auditory({ entity: 'Client', action: 'CREATE' })
  @ApiOperation({ summary: 'Crear nuevo cliente' })
  @ApiResponse({ status: 201, description: 'Cliente creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 409, description: 'Email o CUIT ya registrado' })
  async create(@Body() createClientDto: CreateClientDto): Promise<{ success: boolean; message: string; data: ClientWithPrepaids }> {
    const client = await this.clientsService.create(createClientDto);
    return {
      success: true,
      message: 'Cliente creado exitosamente',
      data: client,
    };
  }

  @Get('paginated')
  @ApiOperation({ summary: 'Obtener todos los clientes con paginación' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Número de página' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Límite por página' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Término de búsqueda' })
  @ApiQuery({ name: 'from', required: false, type: String, description: 'Fecha de inicio (YYYY-MM-DD)', format: 'date' })
  @ApiQuery({ name: 'to', required: false, type: String, description: 'Fecha de fin (YYYY-MM-DD)', format: 'date' })
  @ApiResponse({ status: 200, description: 'Lista de clientes obtenida exitosamente' })
  async findAllPaginated(@Query() paginationDto: PaginatedDateFilterDto): Promise<{ success: boolean; message: string; data: PaginatedResponse<Client> }> {
    const result = await this.clientsService.findAll(paginationDto);
    return {
      success: true,
      message: 'Clientes obtenidos exitosamente',
      data: result,
    };
  }

  @Get('all')
  @ApiOperation({ summary: 'Obtener todos los clientes sin paginación' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Término de búsqueda' })
  @ApiResponse({ status: 200, description: 'Lista completa de clientes obtenida exitosamente' })
  async findAllWithoutPagination(@Query('search') search?: string): Promise<{ success: boolean; message: string; data: Client[] }> {
    const clients = await this.clientsService.findWithoutPagination(search);
    return {
      success: true,
      message: 'Clientes obtenidos exitosamente',
      data: clients,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener cliente por ID' })
  @ApiParam({ name: 'id', description: 'ID del cliente' })
  @ApiResponse({ status: 200, description: 'Cliente encontrado exitosamente' })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado' })
  async findOne(@Param('id') id: string): Promise<{ success: boolean; message: string; data: ClientWithPrepaids }> {
    const client = await this.clientsService.findOne(id);
    return {
      success: true,
      message: 'Cliente obtenido exitosamente',
      data: client,
    };
  }

  @Get(':id/prepaids')
  @ApiOperation({ summary: 'Obtener prepaids del cliente' })
  @ApiParam({ name: 'id', description: 'ID del cliente' })
  @ApiResponse({ status: 200, description: 'Prepaids del cliente obtenidos exitosamente' })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado' })
  async getClientPrepaids(@Param('id') id: string): Promise<{ success: boolean; message: string; data: any[] }> {
    const prepaids = await this.clientsService.getClientPrepaids(id);
    return {
      success: true,
      message: 'Prepaids del cliente obtenidos exitosamente',
      data: prepaids,
    };
  }

  @Get(':id/prepaids/pending')
  @ApiOperation({ summary: 'Obtener prepaids pendientes del cliente' })
  @ApiParam({ name: 'id', description: 'ID del cliente' })
  @ApiResponse({ status: 200, description: 'Prepaids pendientes obtenidos exitosamente' })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado' })
  async getClientPendingPrepaids(@Param('id') id: string): Promise<{ success: boolean; message: string; data: any[] }> {
    const prepaids = await this.clientsService.getClientPendingPrepaids(id);
    return {
      success: true,
      message: 'Prepaids pendientes obtenidos exitosamente',
      data: prepaids,
    };
  }

  @Patch(':id')
  @Auditory({ entity: 'Client', action: 'UPDATE' })
  @ApiOperation({ summary: 'Actualizar cliente' })
  @ApiParam({ name: 'id', description: 'ID del cliente' })
  @ApiResponse({ status: 200, description: 'Cliente actualizado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado' })
  @ApiResponse({ status: 409, description: 'Email o CUIT ya registrado' })
  async update(
    @Param('id') id: string,
    @Body() updateClientDto: UpdateClientDto,
  ): Promise<{ success: boolean; message: string; data: ClientWithPrepaids }> {
    const client = await this.clientsService.update(id, updateClientDto);
    return {
      success: true,
      message: 'Cliente actualizado exitosamente',
      data: client,
    };
  }

  @Delete(':id')
  @Auditory({ entity: 'Client', action: 'DELETE' })
  @ApiOperation({ summary: 'Eliminar cliente (soft delete)' })
  @ApiParam({ name: 'id', description: 'ID del cliente' })
  @ApiResponse({ status: 200, description: 'Cliente eliminado exitosamente' })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado' })
  async remove(@Param('id') id: string): Promise<{ success: boolean; message: string }> {
    await this.clientsService.remove(id);
    return {
      success: true,
      message: 'Cliente eliminado exitosamente',
    };
  }
}

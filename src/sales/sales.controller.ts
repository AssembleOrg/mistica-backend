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
import { SalesService } from './sales.service';
import { CreateSaleDto, UpdateSaleDto, PaginationDto, DailySalesQueryDto } from '../common/dto';
import { Sale, PaginatedResponse, DailySalesResponse } from '../common/interfaces';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Auditory } from '../common/decorators';

@ApiTags('Ventas')
@Controller('sales')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  @Auditory({ entity: 'Sale', action: 'CREATE' })
  @ApiOperation({ summary: 'Crear nueva venta' })
  @ApiResponse({ status: 201, description: 'Venta creada exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos o stock insuficiente' })
  @ApiResponse({ status: 404, description: 'Producto no encontrado' })
  async create(@Body() createSaleDto: CreateSaleDto): Promise<{ success: boolean; message: string; data: Sale }> {
    const sale = await this.salesService.create(createSaleDto);
    return {
      success: true,
      message: 'Venta creada exitosamente',
      data: sale,
    };
  }

  @Get('paginated')
  @ApiOperation({ summary: 'Obtener todas las ventas con paginación' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Número de página' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Límite por página' })
  @ApiResponse({ status: 200, description: 'Lista de ventas obtenida exitosamente' })
  async findAllPaginated(@Query() paginationDto: PaginationDto): Promise<{ success: boolean; message: string; data: PaginatedResponse<Sale> }> {
    const result = await this.salesService.findAll(paginationDto);
    return {
      success: true,
      message: 'Ventas obtenidas exitosamente',
      data: result,
    };
  }

  @Get('all')
  @ApiOperation({ summary: 'Obtener todas las ventas sin paginación' })
  @ApiResponse({ status: 200, description: 'Lista completa de ventas obtenida exitosamente' })
  async findAllWithoutPagination(): Promise<{ success: boolean; message: string; data: Sale[] }> {
    const sales = await this.salesService.findWithoutPagination();
    return {
      success: true,
      message: 'Ventas obtenidas exitosamente',
      data: sales,
    };
  }

  @Get('daily')
  @ApiOperation({ summary: 'Obtener ventas del día' })
  @ApiQuery({ name: 'date', required: false, type: String, description: 'Fecha en formato YYYY-MM-DD (default: hoy)' })
  @ApiQuery({ name: 'timezone', required: false, type: String, description: 'Zona horaria (default: America/Argentina/Buenos_Aires)' })
  @ApiResponse({ status: 200, description: 'Ventas del día obtenidas exitosamente' })
  async getDailySales(@Query() query: DailySalesQueryDto): Promise<{ success: boolean; message: string; data: DailySalesResponse }> {
    const result = await this.salesService.getDailySales(query);
    return {
      success: true,
      message: 'Ventas del día obtenidas exitosamente',
      data: result,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener venta por ID' })
  @ApiParam({ name: 'id', description: 'ID de la venta' })
  @ApiResponse({ status: 200, description: 'Venta encontrada exitosamente' })
  @ApiResponse({ status: 404, description: 'Venta no encontrada' })
  async findOne(@Param('id') id: string): Promise<{ success: boolean; message: string; data: Sale }> {
    const sale = await this.salesService.findOne(id);
    return {
      success: true,
      message: 'Venta obtenida exitosamente',
      data: sale,
    };
  }

  @Patch(':id')
  @Auditory({ entity: 'Sale', action: 'UPDATE' })
  @ApiOperation({ summary: 'Actualizar venta' })
  @ApiParam({ name: 'id', description: 'ID de la venta' })
  @ApiResponse({ status: 200, description: 'Venta actualizada exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos o venta no modificable' })
  @ApiResponse({ status: 404, description: 'Venta no encontrada' })
  async update(
    @Param('id') id: string,
    @Body() updateSaleDto: UpdateSaleDto,
  ): Promise<{ success: boolean; message: string; data: Sale }> {
    const sale = await this.salesService.update(id, updateSaleDto);
    return {
      success: true,
      message: 'Venta actualizada exitosamente',
      data: sale,
    };
  }

  @Delete(':id')
  @Auditory({ entity: 'Sale', action: 'DELETE' })
  @ApiOperation({ summary: 'Eliminar venta (soft delete)' })
  @ApiParam({ name: 'id', description: 'ID de la venta' })
  @ApiResponse({ status: 200, description: 'Venta eliminada exitosamente' })
  @ApiResponse({ status: 404, description: 'Venta no encontrada' })
  async remove(@Param('id') id: string): Promise<{ success: boolean; message: string }> {
    await this.salesService.remove(id);
    return {
      success: true,
      message: 'Venta eliminada exitosamente',
    };
  }
}

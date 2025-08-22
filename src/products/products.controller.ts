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
import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto, PaginationDto } from '../common/dto';
import { Product } from '../common/interfaces';
import { PaginatedResponse } from '../common/interfaces';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Auditory } from '../common/decorators';

@ApiTags('Productos')
@Controller('products')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @Auditory({ entity: 'Product', action: 'CREATE' })
  @ApiOperation({ summary: 'Crear nuevo producto' })
  @ApiResponse({ status: 201, description: 'Producto creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos o precio inválido' })
  @ApiResponse({ status: 409, description: 'Código de barras ya registrado' })
  async create(@Body() createProductDto: CreateProductDto): Promise<Product> {
    return this.productsService.create(createProductDto);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todos los productos con paginación' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Número de página' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Límite por página' })
  @ApiResponse({ status: 200, description: 'Lista de productos obtenida exitosamente' })
  async findAll(@Query() paginationDto: PaginationDto): Promise<PaginatedResponse<Product>> {
    return this.productsService.findAll(paginationDto);
  }

  @Get('all')
  @ApiOperation({ summary: 'Obtener todos los productos sin paginación' })
  @ApiResponse({ status: 200, description: 'Lista completa de productos obtenida exitosamente' })
  async findAllWithoutPagination(): Promise<Product[]> {
    return this.productsService.findWithoutPagination();
  }

  @Get('category/:category')
  @ApiOperation({ summary: 'Obtener productos por categoría con paginación' })
  @ApiParam({ name: 'category', description: 'Categoría del producto', enum: ['organicos', 'aromaticos', 'wellness'] })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Número de página' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Límite por página' })
  @ApiResponse({ status: 200, description: 'Lista de productos por categoría obtenida exitosamente' })
  async findByCategory(
    @Param('category') category: string,
    @Query() paginationDto: PaginationDto,
  ): Promise<PaginatedResponse<Product>> {
    return this.productsService.findByCategory(category, paginationDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener producto por ID' })
  @ApiResponse({ status: 200, description: 'Producto encontrado exitosamente' })
  @ApiResponse({ status: 404, description: 'Producto no encontrado' })
  async findOne(@Param('id') id: string): Promise<Product> {
    return this.productsService.findOne(id);
  }

  @Patch(':id')
  @Auditory({ entity: 'Product', action: 'UPDATE' })
  @ApiOperation({ summary: 'Actualizar producto' })
  @ApiResponse({ status: 200, description: 'Producto actualizado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos o precio inválido' })
  @ApiResponse({ status: 404, description: 'Producto no encontrado' })
  @ApiResponse({ status: 409, description: 'Código de barras ya registrado' })
  async update(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
  ): Promise<Product> {
    return this.productsService.update(id, updateProductDto);
  }

  @Patch(':id/stock/add')
  @Auditory({ entity: 'Product', action: 'UPDATE_STOCK' })
  @ApiOperation({ summary: 'Agregar stock al producto' })
  @ApiResponse({ status: 200, description: 'Stock actualizado exitosamente' })
  @ApiResponse({ status: 400, description: 'Cantidad inválida' })
  @ApiResponse({ status: 404, description: 'Producto no encontrado' })
  async addStock(
    @Param('id') id: string,
    @Body() body: { quantity: number },
  ): Promise<Product> {
    return this.productsService.updateStock(id, body.quantity, 'add');
  }

  @Patch(':id/stock/subtract')
  @Auditory({ entity: 'Product', action: 'UPDATE_STOCK' })
  @ApiOperation({ summary: 'Restar stock del producto' })
  @ApiResponse({ status: 200, description: 'Stock actualizado exitosamente' })
  @ApiResponse({ status: 400, description: 'Stock insuficiente o cantidad inválida' })
  @ApiResponse({ status: 404, description: 'Producto no encontrado' })
  async subtractStock(
    @Param('id') id: string,
    @Body() body: { quantity: number },
  ): Promise<Product> {
    return this.productsService.updateStock(id, body.quantity, 'subtract');
  }

  @Delete(':id')
  @Auditory({ entity: 'Product', action: 'DELETE' })
  @ApiOperation({ summary: 'Eliminar producto (soft delete)' })
  @ApiResponse({ status: 200, description: 'Producto eliminado exitosamente' })
  @ApiResponse({ status: 404, description: 'Producto no encontrado' })
  async remove(@Param('id') id: string): Promise<void> {
    return this.productsService.remove(id);
  }
} 
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
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from '../common/dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Auditory } from '../common/decorators';

@ApiTags('Categorías')
@Controller('categories')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar categorías' })
  async findAll() {
    const data = await this.service.findAll();
    return { success: true, message: 'Categorías obtenidas', data };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener categoría por ID' })
  async findOne(@Param('id') id: string) {
    const data = await this.service.findOne(id);
    return { success: true, message: 'Categoría obtenida', data };
  }

  @Post()
  @Auditory({ entity: 'Category', action: 'CREATE' })
  @ApiOperation({ summary: 'Crear categoría' })
  async create(@Body() dto: CreateCategoryDto) {
    const data = await this.service.create(dto);
    return { success: true, message: 'Categoría creada', data };
  }

  @Patch(':id')
  @Auditory({ entity: 'Category', action: 'UPDATE' })
  @ApiOperation({ summary: 'Actualizar categoría' })
  async update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    const data = await this.service.update(id, dto);
    return { success: true, message: 'Categoría actualizada', data };
  }

  @Delete(':id')
  @Auditory({ entity: 'Category', action: 'DELETE' })
  @ApiOperation({ summary: 'Eliminar categoría (soft delete)' })
  async remove(@Param('id') id: string) {
    await this.service.remove(id);
    return { success: true, message: 'Categoría eliminada' };
  }
}

import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ClientLabelsService } from './client-labels.service';
import { CreateClientLabelDto, UpdateClientLabelDto } from '../common/dto/client-label.dto';

@ApiTags('Etiquetas de Clientes')
@Controller('client-labels')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ClientLabelsController {
  constructor(private readonly service: ClientLabelsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar etiquetas activas' })
  async findAll() {
    const data = await this.service.findAll();
    return { success: true, message: 'Etiquetas obtenidas exitosamente', data };
  }

  @Post()
  @ApiOperation({ summary: 'Crear etiqueta' })
  async create(@Body() dto: CreateClientLabelDto) {
    const data = await this.service.create(dto);
    return { success: true, message: 'Etiqueta creada exitosamente', data };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar etiqueta' })
  @ApiParam({ name: 'id', description: 'ID de la etiqueta' })
  async update(@Param('id') id: string, @Body() dto: UpdateClientLabelDto) {
    const data = await this.service.update(id, dto);
    return { success: true, message: 'Etiqueta actualizada exitosamente', data };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar etiqueta (bloqueado si tiene clientes asignados)' })
  @ApiParam({ name: 'id', description: 'ID de la etiqueta' })
  async remove(@Param('id') id: string) {
    await this.service.remove(id);
    return { success: true, message: 'Etiqueta eliminada exitosamente' };
  }
}

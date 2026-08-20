import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CreateShoppingItemDto,
  CreateStaffTaskDto,
  UpdateShoppingItemDto,
  UpdateStaffTaskDto,
} from '../common/dto/staff.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { StaffService } from './staff.service';

interface AuthRequest extends Request {
  user?: { id: string };
}

/**
 * Tareas del personal y lista de compras interna. Cualquier cuenta
 * autenticada con la vista habilitada opera; la carga rápida es la prioridad.
 */
@ApiTags('Equipo')
@Controller('staff')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class StaffController {
  constructor(private readonly service: StaffService) {}

  // ── Tareas ──

  @Get('tasks')
  @ApiOperation({ summary: 'Listar tareas del personal' })
  listTasks(@Query('status') status?: 'PENDING' | 'DONE') {
    return this.service.listTasks(status);
  }

  @Post('tasks')
  @ApiOperation({ summary: 'Crear tarea (opcionalmente asignada)' })
  createTask(@Body() dto: CreateStaffTaskDto, @Req() req: AuthRequest) {
    return this.service.createTask(dto, req.user?.id);
  }

  @Patch('tasks/:id')
  @ApiOperation({ summary: 'Editar tarea / marcarla hecha' })
  updateTask(@Param('id') id: string, @Body() dto: UpdateStaffTaskDto) {
    return this.service.updateTask(id, dto);
  }

  @Delete('tasks/:id')
  @ApiOperation({ summary: 'Eliminar tarea' })
  removeTask(@Param('id') id: string) {
    return this.service.removeTask(id);
  }

  // ── Lista de compras ──

  @Get('shopping')
  @ApiOperation({ summary: 'Lista de compras del establecimiento' })
  listShopping(@Query('status') status?: 'PENDING' | 'BOUGHT') {
    return this.service.listShopping(status);
  }

  @Post('shopping')
  @ApiOperation({ summary: 'Agregar ítem a la lista de compras' })
  createShoppingItem(
    @Body() dto: CreateShoppingItemDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.createShoppingItem(dto, req.user?.id);
  }

  @Patch('shopping/:id')
  @ApiOperation({ summary: 'Editar ítem / marcarlo comprado' })
  updateShoppingItem(
    @Param('id') id: string,
    @Body() dto: UpdateShoppingItemDto,
  ) {
    return this.service.updateShoppingItem(id, dto);
  }

  @Delete('shopping/:id')
  @ApiOperation({ summary: 'Eliminar ítem' })
  removeShoppingItem(@Param('id') id: string) {
    return this.service.removeShoppingItem(id);
  }
}

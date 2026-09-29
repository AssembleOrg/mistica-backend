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
  AddStaffTaskCommentDto,
  CreateShoppingItemDto,
  CreateStaffTaskDto,
  UpdateShoppingItemDto,
  UpdateStaffTaskDto,
} from '../common/dto/staff.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { AllowedViews } from '../common/decorators';
import { AllowedViewsGuard } from '../common/guards/allowed-views.guard';
import { StaffService } from './staff.service';

interface AuthRequest extends Request {
  user?: { id: string; role?: string };
}

/**
 * Tareas del personal y lista de compras interna. Las tareas las crea, edita y
 * borra el admin; cada integrante ve sólo las que tiene asignadas, les suma su
 * progreso y las marca hechas. La lista de compras la opera cualquiera.
 */
@ApiTags('Equipo')
@Controller('staff')
@UseGuards(JwtAuthGuard, AllowedViewsGuard)
@ApiBearerAuth()
@AllowedViews('equipo')
export class StaffController {
  constructor(private readonly service: StaffService) {}

  // ── Tareas ──

  @Get('tasks')
  @ApiOperation({ summary: 'Listar tareas del personal' })
  listTasks(
    @Query('status') status: 'PENDING' | 'DONE' | undefined,
    @Req() req: AuthRequest,
  ) {
    return this.service.listTasks(status, req.user);
  }

  @Post('tasks')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear tarea (opcionalmente asignada)' })
  createTask(@Body() dto: CreateStaffTaskDto, @Req() req: AuthRequest) {
    return this.service.createTask(dto, req.user?.id);
  }

  @Patch('tasks/:id')
  @ApiOperation({ summary: 'Editar tarea / marcarla hecha' })
  updateTask(
    @Param('id') id: string,
    @Body() dto: UpdateStaffTaskDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.updateTask(id, dto, req.user);
  }

  @Post('tasks/:id/comments')
  @ApiOperation({ summary: 'Agregar una actualización al historial de la tarea' })
  addTaskComment(
    @Param('id') id: string,
    @Body() dto: AddStaffTaskCommentDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.addTaskComment(id, dto.body, req.user);
  }

  @Delete('tasks/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
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

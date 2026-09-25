import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CreateStudentDto,
  CreateStudentPaymentDto,
  SaveAttendanceDto,
  UpdateStudentDto,
  UpdateStudentPaymentDto,
} from '../common/dto/student.dto';
import { UpsertMonthlyPieceDto } from '../common/dto/student-monthly-piece.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { AllowedViews } from '../common/decorators';
import { AllowedViewsGuard } from '../common/guards/allowed-views.guard';
import { UserRole } from '../common/enums/user-role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { StudentsService } from './students.service';

interface AuthRequest extends Request {
  user?: { id: string; role?: string };
}

/**
 * Alumnos. Lo PRÁCTICO (lista, ficha práctica, asistencia) está abierto a
 * cuentas autenticadas (profesores incluidos); lo ADMINISTRATIVO (ficha con
 * pagos, alta/edición, cobros, alertas) es sólo ADMIN.
 */
@ApiTags('Alumnos')
@Controller('students')
@UseGuards(JwtAuthGuard, AllowedViewsGuard, RolesGuard)
@ApiBearerAuth()
@AllowedViews('alumnos')
export class StudentsController {
  constructor(private readonly service: StudentsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar alumnos' })
  list(
    @Query('includeInactive') includeInactive: string | undefined,
    @Req() req: AuthRequest,
  ) {
    return this.service.list(req.user, includeInactive === 'true');
  }

  @Get('payment-alerts')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Cuotas vencidas y por vencer (situaciones administrativas)',
  })
  paymentAlerts(@Query('days') days?: string) {
    return this.service.paymentAlerts(days ? Number(days) : 7);
  }

  // ── Pieza del mes ──

  @Get('monthly-pieces')
  @ApiOperation({
    summary: 'Planilla de piezas del mes (un alumno por fila) — ?month=YYYY-MM',
  })
  monthlyPieces(@Query('month') month: string, @Req() req: AuthRequest) {
    return this.service.monthlyPiecesOfMonth(month ?? '', req.user);
  }

  @Get(':id/monthly-pieces')
  @ApiOperation({ summary: 'Historial de piezas del mes de un alumno' })
  monthlyPiecesOf(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.service.monthlyPiecesOfStudent(id, req.user);
  }

  @Put(':id/monthly-pieces/:month')
  @ApiOperation({ summary: 'Cargar / editar la pieza del mes de un alumno' })
  upsertMonthlyPiece(
    @Param('id') id: string,
    @Param('month') month: string,
    @Body() dto: UpsertMonthlyPieceDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.upsertMonthlyPiece(id, month, dto, req.user);
  }

  @Delete(':id/monthly-pieces/:month')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Borrar la pieza del mes de un alumno' })
  removeMonthlyPiece(@Param('id') id: string, @Param('month') month: string) {
    return this.service.removeMonthlyPiece(id, month);
  }

  @Get(':id/practical')
  @ApiOperation({
    summary: 'Ficha PRÁCTICA (grupos, asistencia, piezas; sin plata)',
  })
  practical(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.service.practicalProfile(id, req.user);
  }

  @Get(':id/admin')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Ficha ADMINISTRATIVA (datos, pagos, regularidad)',
  })
  admin(@Param('id') id: string) {
    return this.service.adminProfile(id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear alumno' })
  create(@Body() dto: CreateStudentDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Editar alumno' })
  update(@Param('id') id: string, @Body() dto: UpdateStudentDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Eliminar alumno (soft delete)' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  // ── Pagos ──

  @Post(':id/payments')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Registrar pago o cuota de un alumno' })
  addPayment(
    @Param('id') id: string,
    @Body() dto: CreateStudentPaymentDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.addPayment(id, dto, req.user?.id);
  }

  @Patch('payments/:paymentId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Editar un pago (marcar pagado, corregir)' })
  updatePayment(
    @Param('paymentId') paymentId: string,
    @Body() dto: UpdateStudentPaymentDto,
  ) {
    return this.service.updatePayment(paymentId, dto);
  }

  @Delete('payments/:paymentId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Eliminar un pago (soft delete)' })
  removePayment(@Param('paymentId') paymentId: string) {
    return this.service.removePayment(paymentId);
  }

  // ── Asistencia ──

  @Post('attendance')
  @ApiOperation({
    summary: 'Guardar la asistencia de un grupo para un día (upsert)',
  })
  saveAttendance(@Body() dto: SaveAttendanceDto, @Req() req: AuthRequest) {
    return this.service.saveAttendance(dto, req.user);
  }

  @Get('attendance/of-group/:groupId')
  @ApiOperation({ summary: 'Historial de asistencia de un grupo' })
  attendanceOfGroup(
    @Param('groupId') groupId: string,
    @Query('limit') limit?: string,
    @Req() req?: AuthRequest,
  ) {
    return this.service.attendanceOfGroup(
      groupId,
      limit ? Number(limit) : 30,
      req?.user,
    );
  }
}

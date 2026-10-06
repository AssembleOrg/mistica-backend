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
import { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import {
  AddReservationCakeDto,
  AdminCreateReservationDto,
  ResolveTransferReceiptDto,
  AdminRescheduleReservationDto,
  AdminUpdateReservationDto,
  ListReservationsQueryDto,
  ResolveReviewDto,
  ScheduleSaleDto,
} from '../common/dto/reservation.dto';
import { AddSalePaymentsDto, CreateSaleDto } from '../common/dto/sale.dto';
import { UserRole } from '../common/enums/user-role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ReservationsService } from '../reservations/reservations.service';
import { AllowedViews } from '../common/decorators';
import { AllowedViewsGuard } from '../common/guards/allowed-views.guard';

interface AuthRequest extends Request {
  user?: { id: string; role?: string; allowedViews?: string[] };
}

@ApiTags('Reservas (admin)')
@Controller('admin/reservations')
@UseGuards(JwtAuthGuard, AllowedViewsGuard)
@ApiBearerAuth()
@AllowedViews('reservas')
export class ReservationsAdminController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Crear reserva desde admin (CONFIRMED + caja)' })
  async create(
    @Body() dto: AdminCreateReservationDto,
    @Req() req: AuthRequest,
  ) {
    return this.reservationsService.adminCreateReservation(dto, req.user?.id);
  }

  @Post('from-sale/:saleId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({
    summary:
      'Agendar una venta del local (POS): reserva CONFIRMED vinculada a la venta, sin cobrar de nuevo',
  })
  async scheduleSale(
    @Param('saleId') saleId: string,
    @Body() dto: ScheduleSaleDto,
    @Req() req: AuthRequest,
  ) {
    return this.reservationsService.scheduleSale(saleId, dto, req.user?.id);
  }

  @Get()
  @ApiOperation({ summary: 'Listar reservas (admin)' })
  async list(@Query() query: ListReservationsQueryDto, @Req() req: AuthRequest) {
    return this.reservationsService.list(query, req.user);
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Cancelar reserva (libera cupo; reembolsa si MP)' })
  async cancel(@Param('id') id: string) {
    return this.reservationsService.adminCancel(id);
  }

  @Post(':id/resolve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Resolver una reserva en revisión (confirm | cancel)' })
  async resolve(@Param('id') id: string, @Body() dto: ResolveReviewDto) {
    return this.reservationsService.adminResolveReview(id, dto.action);
  }

  @Post(':id/reschedule')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({
    summary:
      'Reprogramar reserva a otro turno (hasta 48 h antes; force = override)',
  })
  async reschedule(
    @Param('id') id: string,
    @Body() dto: AdminRescheduleReservationDto,
  ) {
    return this.reservationsService.adminReschedule(id, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Editar datos de una reserva' })
  async update(@Param('id') id: string, @Body() dto: AdminUpdateReservationDto) {
    return this.reservationsService.adminUpdate(id, dto);
  }

  @Post(':id/cakes')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({
    summary:
      'Sumar una torta para cocina (con precio, también suma como adicional)',
  })
  async addCake(@Param('id') id: string, @Body() dto: AddReservationCakeDto) {
    return this.reservationsService.addCake(id, dto);
  }

  @Delete(':id/cakes/:cakeId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Sacar una torta de la lista de cocina' })
  async removeCake(@Param('id') id: string, @Param('cakeId') cakeId: string) {
    return this.reservationsService.removeCake(id, cakeId);
  }

  @Post(':id/receipts/:receiptId/resolve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({
    summary:
      'Verificar un comprobante que mandó el cliente: cobrar con él o descartarlo',
  })
  async resolveReceipt(
    @Param('id') id: string,
    @Param('receiptId') receiptId: string,
    @Body() dto: ResolveTransferReceiptDto,
  ) {
    return this.reservationsService.resolveTransferReceipt(id, receiptId, dto);
  }

  @Post(':id/collect-balance')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Cobrar el saldo pendiente (sobre la venta vinculada)' })
  async collectBalance(
    @Param('id') id: string,
    @Body() dto: AddSalePaymentsDto,
  ) {
    return this.reservationsService.adminCollectBalance(id, dto);
  }

  @Get(':id/checkout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Qué se cobra al pasar la reserva por Nueva venta' })
  async checkoutPlan(@Param('id') id: string) {
    return this.reservationsService.checkoutPlan(id);
  }

  @Post(':id/checkout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Cobrar la reserva con una venta del POS (la deja saldada)' })
  async checkout(@Param('id') id: string, @Body() dto: CreateSaleDto) {
    return this.reservationsService.checkout(id, dto);
  }
}

import {
  Body,
  Controller,
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
  AdminCreateReservationDto,
  AdminUpdateReservationDto,
  ListReservationsQueryDto,
  ResolveReviewDto,
} from '../common/dto/reservation.dto';
import { AddSalePaymentsDto } from '../common/dto/sale.dto';
import { UserRole } from '../common/enums/user-role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ReservationsService } from '../reservations/reservations.service';

interface AuthRequest extends Request {
  user?: { id: string };
}

@ApiTags('Reservas (admin)')
@Controller('admin/reservations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ReservationsAdminController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear reserva desde admin (CONFIRMED + caja)' })
  async create(
    @Body() dto: AdminCreateReservationDto,
    @Req() req: AuthRequest,
  ) {
    return this.reservationsService.adminCreateReservation(dto, req.user?.id);
  }

  @Get()
  @ApiOperation({ summary: 'Listar reservas (admin)' })
  async list(@Query() query: ListReservationsQueryDto) {
    return this.reservationsService.list(query);
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Cancelar reserva (libera cupo; reembolsa si MP)' })
  async cancel(@Param('id') id: string) {
    return this.reservationsService.adminCancel(id);
  }

  @Post(':id/resolve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Resolver una reserva en revisión (confirm | cancel)' })
  async resolve(@Param('id') id: string, @Body() dto: ResolveReviewDto) {
    return this.reservationsService.adminResolveReview(id, dto.action);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Editar datos de una reserva' })
  async update(@Param('id') id: string, @Body() dto: AdminUpdateReservationDto) {
    return this.reservationsService.adminUpdate(id, dto);
  }

  @Post(':id/collect-balance')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Cobrar el saldo pendiente (sobre la venta vinculada)' })
  async collectBalance(
    @Param('id') id: string,
    @Body() dto: AddSalePaymentsDto,
  ) {
    return this.reservationsService.adminCollectBalance(id, dto);
  }
}

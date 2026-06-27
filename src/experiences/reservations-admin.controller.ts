import {
  Body,
  Controller,
  Get,
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
  ListReservationsQueryDto,
} from '../common/dto/reservation.dto';
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
}

import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public, Throttle } from '../common/decorators';
import { SimpleThrottleGuard } from '../common/guards/simple-throttle.guard';
import { CreateHoldDto } from '../common/dto/reservation.dto';
import { ReservationsService } from './reservations.service';

@ApiTags('Reservas')
@Controller('reservations')
@UseGuards(SimpleThrottleGuard)
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post('hold')
  @Public()
  @Throttle(8, 60) // máx 8 holds por IP por minuto (anti acaparamiento de cupo)
  @ApiOperation({
    summary: 'Crear hold público (reserva PENDING + preference MercadoPago)',
  })
  async createHold(@Body() dto: CreateHoldDto) {
    return this.reservationsService.createHold(dto);
  }

  @Get(':id/status')
  @Public()
  @ApiOperation({ summary: 'Estado de una reserva (polling)' })
  async status(@Param('id') id: string) {
    return this.reservationsService.getStatus(id);
  }

  @Get('code/:code')
  @Public()
  @Throttle(20, 60) // anti fuerza bruta de códigos de gestión
  @ApiOperation({ summary: 'Buscar reserva por código de gestión' })
  async byCode(@Param('code') code: string) {
    return this.reservationsService.getByCode(code);
  }

  @Post('code/:code/cancel')
  @Public()
  @Throttle(10, 60)
  @ApiOperation({ summary: 'Cancelar reserva por código' })
  async cancel(@Param('code') code: string) {
    return this.reservationsService.cancelByCode(code);
  }
}

import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators';
import { CreateHoldDto } from '../common/dto/reservation.dto';
import { ReservationsService } from './reservations.service';

@ApiTags('Reservas')
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post('hold')
  @Public()
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
  @ApiOperation({ summary: 'Buscar reserva por código de gestión' })
  async byCode(@Param('code') code: string) {
    return this.reservationsService.getByCode(code);
  }

  @Post('code/:code/cancel')
  @Public()
  @ApiOperation({ summary: 'Cancelar reserva por código' })
  async cancel(@Param('code') code: string) {
    return this.reservationsService.cancelByCode(code);
  }
}

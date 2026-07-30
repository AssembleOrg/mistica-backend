import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public, Throttle } from '../common/decorators';
import { SimpleThrottleGuard } from '../common/guards/simple-throttle.guard';
import {
  AvailabilityQueryDto,
  CreateHoldDto,
  PreviewTablesDto,
  TransferProofDto,
} from '../common/dto/reservation.dto';
import { envConfig } from '../config/env.config';
import { ReservationsService } from './reservations.service';
import { AvailabilityService } from './availability.service';

@ApiTags('Reservas')
@Controller('reservations')
@UseGuards(SimpleThrottleGuard)
export class ReservationsController {
  constructor(
    private readonly reservationsService: ReservationsService,
    private readonly availabilityService: AvailabilityService,
  ) {}

  @Post('hold')
  @Public()
  @Throttle(8, 60) // máx 8 holds por IP por minuto (anti acaparamiento de cupo)
  @ApiOperation({
    summary: 'Crear hold público (reserva PENDING + preference MercadoPago)',
  })
  async createHold(@Body() dto: CreateHoldDto) {
    return this.reservationsService.createHold(dto);
  }

  @Get('availability')
  @Public()
  @Throttle(60, 60)
  @ApiOperation({
    summary:
      'Días y turnos donde se puede reservar una experiencia. No hace falta cargar turnos: salen de las plantillas del día.',
  })
  async availability(@Query() q: AvailabilityQueryDto) {
    return this.availabilityService.forExperience({
      experienceId: q.experienceId,
      from: q.from,
      to: q.to,
      days: q.days,
      includeFull: q.includeFull,
    });
  }

  @Post('preview-tables')
  @Public()
  @Throttle(30, 60)
  @ApiOperation({
    summary:
      '¿Entra el grupo en las mesas del turno? No reserva. Distingue si sólo entra compartiendo mesa grande.',
  })
  async previewTables(@Body() dto: PreviewTablesDto) {
    return this.reservationsService.previewTables(dto);
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

  // Uso INTERNO del bot de WhatsApp (secreto compartido, igual que
  // /clients/lookup): asociar un comprobante de transferencia que llega por
  // chat con el hold TRANSFER pendiente de ese teléfono.
  @Get('pending-transfer/by-phone')
  @Public()
  @ApiOperation({
    summary: 'Hold TRANSFER pendiente por teléfono (interno del bot)',
  })
  async pendingTransfer(
    @Query('phone') phone: string,
    @Headers('x-bot-secret') secret?: string,
  ) {
    this.assertBotSecret(secret);
    return this.reservationsService.pendingTransferByPhone(phone || '');
  }

  @Post(':id/transfer-proof')
  @Public()
  @ApiOperation({
    summary:
      'Resolver comprobante de transferencia (interno del bot): confirma o manda a revisión',
  })
  async transferProof(
    @Param('id') id: string,
    @Body() dto: TransferProofDto,
    @Headers('x-bot-secret') secret?: string,
  ) {
    this.assertBotSecret(secret);
    return this.reservationsService.resolveTransferProof(id, dto);
  }

  private assertBotSecret(secret?: string): void {
    const expected = envConfig.botControl.secret;
    if (!expected || secret !== expected) {
      throw new UnauthorizedException('No autorizado');
    }
  }
}

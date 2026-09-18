import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public, Throttle, AllowedViews } from '../common/decorators';
import { SimpleThrottleGuard } from '../common/guards/simple-throttle.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CreateLeadDto,
  ListLeadsQueryDto,
  OrphanReceiptDto,
  UpdateLeadDto,
} from '../common/dto/lead.dto';
import { UserRole } from '../common/enums/user-role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { envConfig } from '../config/env.config';
import { LeadsService } from './leads.service';
import { AllowedViewsGuard } from '../common/guards/allowed-views.guard';

@ApiTags('Consultas (leads)')
@Controller('leads')
@UseGuards(SimpleThrottleGuard)
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  // ── Público: el bot / la web captan la consulta ──
  @Post()
  @Public()
  @Throttle(5, 60) // máx 5 consultas por IP por minuto (anti-spam de leads)
  @ApiOperation({ summary: 'Crear consulta (lead) para servicios no online' })
  async create(@Body() dto: CreateLeadDto) {
    return this.leadsService.create(dto);
  }

  // Uso INTERNO del bot (X-Bot-Secret): comprobante de transferencia recibido
  // por WhatsApp SIN reserva pendiente. Guarda imagen + registra la consulta
  // para verificación humana. El match automático es sólo interno.
  @Post('orphan-receipt')
  @Public()
  @Throttle(6, 60)
  @ApiOperation({
    summary: 'Registrar comprobante huérfano (interno del bot)',
  })
  async orphanReceipt(
    @Body() dto: OrphanReceiptDto,
    @Headers('x-bot-secret') secret?: string,
  ) {
    this.assertBotSecret(secret);
    return this.leadsService.registerOrphanReceipt(dto);
  }

  // ── Admin ──
  @Get('receipt-image')
  @UseGuards(JwtAuthGuard, AllowedViewsGuard)
  @AllowedViews('reservas')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'URL firmada (corta vida) de la imagen de un comprobante (admin)',
  })
  async receiptImage(@Query('key') key: string) {
    return this.leadsService.receiptImageUrl(key || '');
  }

  @Get()
  @UseGuards(JwtAuthGuard, AllowedViewsGuard)
  @AllowedViews('reservas')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar consultas (admin)' })
  async list(@Query() query: ListLeadsQueryDto) {
    return this.leadsService.list(query);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, AllowedViewsGuard)
  @AllowedViews('reservas')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Actualizar estado/datos de una consulta (admin)' })
  async update(@Param('id') id: string, @Body() dto: UpdateLeadDto) {
    return this.leadsService.update(id, dto);
  }

  private assertBotSecret(secret?: string): void {
    const expected = envConfig.botControl.secret;
    if (!expected || secret !== expected) {
      throw new UnauthorizedException('No autorizado');
    }
  }
}

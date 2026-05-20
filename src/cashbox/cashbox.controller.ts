import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  Patch,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { CashboxService } from './cashbox.service';
import {
  CloseCashSessionDto,
  OpenCashSessionDto,
  PaginationDto,
} from '../common/dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

interface AuthRequest extends Request {
  user?: { id: string };
}

@ApiTags('Caja')
@Controller('cashbox')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CashboxController {
  constructor(private readonly cashboxService: CashboxService) { }

  @Get('current')
  @ApiOperation({ summary: 'Sesión de caja actualmente abierta (o null)' })
  async getCurrent() {
    return this.cashboxService.getCurrent();
  }

  @Post('open')
  @ApiOperation({ summary: 'Abrir caja con un monto inicial de efectivo' })
  @ApiResponse({ status: 201, description: 'Caja abierta' })
  @ApiResponse({ status: 409, description: 'Ya hay una caja abierta' })
  async open(@Body() dto: OpenCashSessionDto, @Req() req: AuthRequest) {
    return this.cashboxService.open(dto, req.user?.id);
  }

  @Post('close')
  @ApiOperation({
    summary: 'Cerrar la caja abierta. El backend calcula esperado y discrepancia.',
  })
  @ApiResponse({ status: 201, description: 'Caja cerrada' })
  @ApiResponse({ status: 409, description: 'No hay caja abierta' })
  async close(@Body() dto: CloseCashSessionDto, @Req() req: AuthRequest) {
    return this.cashboxService.close(dto, req.user?.id);
  }

  @Get()
  @ApiOperation({ summary: 'Listar sesiones de caja (paginado)' })
  async findAll(@Query() pagination: PaginationDto) {
    return this.cashboxService.findAll(pagination);
  }

  @Get('pending-auto-closure')
  @ApiOperation({ summary: 'Obtener caja pendiente de arqueo' })
  async getPendingAutoClosure() {
    return this.cashboxService.findPendingAutoClosure();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una sesión de caja' })
  async findOne(@Param('id') id: string) {
    return this.cashboxService.findOne(id);
  }

  @Get(':id/transactions')
  @ApiOperation({
    summary:
      'Movimientos cronológicos (ventas + señas + egresos) de una sesión de caja',
  })
  async getSessionTransactions(@Param('id') id: string) {
    return this.cashboxService.getSessionTransactions(id);
  }

  @Patch(':id/resolve-auto')
  @ApiOperation({ summary: 'Completar datos de una caja cerrada automaticamente' })
  async resolveAutoClosure(
    @Param('id') id: string,
    @Body() dto: CloseCashSessionDto,
    @Req() req: AuthRequest,
  ) {
    return this.cashboxService.resolveAutoClosure(id, dto, req.user?.id);
  }
}

import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { SettingsService } from './settings.service';
import { SetCashDeletePinDto } from '../common/dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

interface AuthRequest extends Request {
  user?: { id: string; email?: string };
}

@ApiTags('Ajustes')
@Controller('settings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('cash-delete-pin/status')
  @ApiOperation({
    summary:
      'Indica si ya hay un PIN configurado para borrar egresos. Nunca devuelve el PIN.',
  })
  async getCashDeletePinStatus() {
    return this.settingsService.getCashDeletePinStatus();
  }

  @Put('cash-delete-pin')
  @ApiOperation({
    summary:
      'Configura, cambia o resetea el PIN para borrar egresos. Requiere la contraseña del admin (también es la recuperación ante PIN olvidado).',
  })
  @ApiResponse({ status: 200, description: 'PIN actualizado' })
  @ApiResponse({ status: 401, description: 'Contraseña de admin incorrecta' })
  async setCashDeletePin(
    @Body() dto: SetCashDeletePinDto,
    @Req() req: AuthRequest,
  ) {
    await this.settingsService.setCashDeletePin(
      req.user?.id,
      dto.adminPassword,
      dto.newPin,
    );
    return { ok: true };
  }
}

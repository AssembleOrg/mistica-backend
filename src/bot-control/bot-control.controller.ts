import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { envConfig } from '../config/env.config';

/**
 * Proxy admin → control server del bot de WhatsApp. El secreto vive en el
 * backend (server-side); el frontend nunca lo ve. Permite ver el QR, el estado
 * y reiniciar / cerrar sesión del bot desde el panel.
 */
@ApiTags('Bot de WhatsApp (admin)')
@Controller('admin/bot')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class BotControlController {
  private base(): string {
    const url = envConfig.botControl.url?.replace(/\/$/, '');
    if (!url || !envConfig.botControl.secret) {
      throw new HttpException(
        'Bot no configurado (BOT_CONTROL_URL / BOT_CONTROL_SECRET).',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return url;
  }

  private async call(path: string, method: 'GET' | 'POST'): Promise<unknown> {
    const base = this.base();
    try {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: { 'X-Bot-Secret': envConfig.botControl.secret },
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (!res.ok) {
        throw new HttpException(data, res.status);
      }
      return data;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(
        'No se pudo contactar al bot.',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  @Get('status')
  @ApiOperation({ summary: 'Estado del bot (connected, loggedIn, qr)' })
  async status() {
    return this.call('/status', 'GET');
  }

  @Post('restart')
  @ApiOperation({ summary: 'Reiniciar el bot' })
  async restart() {
    return this.call('/restart', 'POST');
  }

  @Post('logout')
  @ApiOperation({ summary: 'Cerrar sesión del bot (fuerza nuevo QR)' })
  async logout() {
    return this.call('/logout', 'POST');
  }
}

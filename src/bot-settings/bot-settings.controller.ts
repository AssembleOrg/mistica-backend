import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  CreateBotFaqDto,
  UpdateBotFaqDto,
  UpdateBotSettingsDto,
} from '../common/dto/bot-settings.dto';
import { envConfig } from '../config/env.config';
import { BotSettingsService } from './bot-settings.service';

/** Configuración del bot (textos, datos del negocio, FAQ). Sólo admin. */
@ApiTags('Bot de WhatsApp (admin)')
@Controller('admin/bot')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class BotSettingsAdminController {
  constructor(private readonly service: BotSettingsService) {}

  @Get('settings')
  @ApiOperation({ summary: 'Configuración del bot' })
  get() {
    return this.service.get();
  }

  @Put('settings')
  @ApiOperation({ summary: 'Actualizar configuración del bot' })
  update(@Body() dto: UpdateBotSettingsDto) {
    return this.service.update(dto);
  }

  @Get('faq')
  @ApiOperation({ summary: 'Preguntas frecuentes / políticas del bot' })
  listFaq() {
    return this.service.listFaq();
  }

  @Post('faq')
  @ApiOperation({ summary: 'Crear pregunta / política' })
  createFaq(@Body() dto: CreateBotFaqDto) {
    return this.service.createFaq(dto);
  }

  @Patch('faq/:id')
  @ApiOperation({ summary: 'Editar pregunta / política' })
  updateFaq(@Param('id') id: string, @Body() dto: UpdateBotFaqDto) {
    return this.service.updateFaq(id, dto);
  }

  @Delete('faq/:id')
  @ApiOperation({ summary: 'Borrar pregunta / política' })
  async deleteFaq(@Param('id') id: string) {
    await this.service.deleteFaq(id);
    return { ok: true };
  }
}

/** Lectura interna del bot (X-Bot-Secret): settings + FAQ activas. */
@ApiTags('Bot de WhatsApp (interno)')
@Controller('bot')
export class BotSettingsInternalController {
  constructor(private readonly service: BotSettingsService) {}

  @Get('settings/internal')
  @Public()
  @ApiOperation({ summary: 'Configuración para el bot (interno)' })
  forBot(@Headers('x-bot-secret') secret?: string) {
    const expected = envConfig.botControl.secret;
    if (!expected || secret !== expected) {
      throw new UnauthorizedException('No autorizado');
    }
    return this.service.forBot();
  }
}

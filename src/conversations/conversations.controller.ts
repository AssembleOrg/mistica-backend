import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  Sse,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { map, Observable } from 'rxjs';
import { Public, AllowedViews } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  AdminReplyDto,
  AttachMediaDto,
  HandoffRequestDto,
  InboundMessageDto,
  LogTurnDto,
} from '../common/dto/conversation.dto';
import { envConfig } from '../config/env.config';
import { ConversationsService } from './conversations.service';
import { AllowedViewsGuard } from '../common/guards/allowed-views.guard';

/** Lo que el guard de JWT deja en la request. */
interface RequestWithUser {
  user?: { userId?: string; sub?: string; name?: string; email?: string };
}

@ApiTags('Conversaciones')
@Controller('conversations')
@UseGuards(JwtAuthGuard, AllowedViewsGuard)
@AllowedViews('reservas')
export class ConversationsController {
  constructor(private readonly service: ConversationsService) {}

  // ───────────── Interno del bot (secreto compartido) ─────────────

  @Post('handoff')
  @Public()
  @ApiOperation({
    summary:
      'El cliente pidió hablar con una persona: abre la charla y pausa el bot (interno del bot)',
  })
  async handoff(
    @Body() dto: HandoffRequestDto,
    @Headers('x-bot-secret') secret?: string,
  ) {
    this.assertBotSecret(secret);
    const c = await this.service.requestHandoff(dto);
    return { conversationId: String(c._id), status: c.status };
  }

  @Post('log')
  @Public()
  @ApiOperation({
    summary:
      'Registrar un turno de la charla con el bot para la bandeja (interno del bot)',
  })
  async log(@Body() dto: LogTurnDto, @Headers('x-bot-secret') secret?: string) {
    this.assertBotSecret(secret);
    return this.service.logTurn(dto);
  }

  @Post('media')
  @Public()
  @ApiOperation({
    summary:
      'Adjuntar una imagen/documento del cliente a la charla (interno del bot)',
  })
  async media(
    @Body() dto: AttachMediaDto,
    @Headers('x-bot-secret') secret?: string,
  ) {
    this.assertBotSecret(secret);
    return this.service.attachMedia(dto);
  }

  @Post('inbound')
  @Public()
  @ApiOperation({
    summary:
      'Mensaje del cliente mientras lo atiende una persona (interno del bot)',
  })
  async inbound(
    @Body() dto: InboundMessageDto,
    @Headers('x-bot-secret') secret?: string,
  ) {
    this.assertBotSecret(secret);
    return this.service.appendInbound(dto.phone, dto.body);
  }

  @Get('paused')
  @Public()
  @ApiOperation({
    summary: '¿Este chat lo atiende una persona? (interno del bot)',
  })
  async paused(
    @Query('phone') phone: string,
    @Headers('x-bot-secret') secret?: string,
  ) {
    this.assertBotSecret(secret);
    return { paused: await this.service.isPaused(phone || '') };
  }

  // ───────────────────────── Panel ─────────────────────────

  @Get('stream')
  @Sse()
  @UseGuards(JwtAuthGuard, AllowedViewsGuard)
  @AllowedViews('reservas')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Eventos en vivo de las charlas (SSE): charla nueva, mensaje, cierre',
  })
  stream(): Observable<{ data: unknown }> {
    return this.service.stream().pipe(map((event) => ({ data: event })));
  }

  @Get()
  @UseGuards(JwtAuthGuard, AllowedViewsGuard)
  @AllowedViews('reservas')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bandeja de charlas' })
  list(@Query('status') status?: string) {
    return this.service.list(status);
  }

  @Get(':id/messages')
  @UseGuards(JwtAuthGuard, AllowedViewsGuard)
  @AllowedViews('reservas')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mensajes de una charla' })
  messages(@Param('id') id: string) {
    return this.service.messages(id);
  }

  @Post(':id/take')
  @UseGuards(JwtAuthGuard, AllowedViewsGuard)
  @AllowedViews('reservas')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Tomar la charla (pasa a atendida por una persona)',
  })
  take(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.service.take(id, this.who(req));
  }

  @Post(':id/messages')
  @UseGuards(JwtAuthGuard, AllowedViewsGuard)
  @AllowedViews('reservas')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Responder al cliente por WhatsApp' })
  reply(
    @Param('id') id: string,
    @Body() dto: AdminReplyDto,
    @Req() req: RequestWithUser,
  ) {
    return this.service.replyAsAdmin(id, dto.body, this.who(req));
  }

  @Post(':id/close')
  @UseGuards(JwtAuthGuard, AllowedViewsGuard)
  @AllowedViews('reservas')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Dar por terminada la charla y devolverle el chat al bot',
  })
  close(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.service.close(id, this.who(req));
  }

  // ───────────────────────── Helpers ─────────────────────────

  private who(req: RequestWithUser): { id?: string; name?: string } {
    const u = req.user ?? {};
    return { id: u.userId ?? u.sub, name: u.name ?? u.email };
  }

  private assertBotSecret(secret?: string): void {
    const expected = envConfig.botControl.secret;
    if (!expected || secret !== expected) {
      throw new UnauthorizedException('No autorizado');
    }
  }
}

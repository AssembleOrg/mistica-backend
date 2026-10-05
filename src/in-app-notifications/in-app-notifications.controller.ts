import { Controller, Get, Param, Patch, Query, Req, Sse, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { map, Observable } from 'rxjs';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AllowSseToken } from '../common/decorators';
import { SseMessage, withSseHeartbeat } from '../common/utils/sse';
import { InAppNotificationsService } from './in-app-notifications.service';

@ApiTags('Notificaciones del panel')
@Controller('in-app-notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class InAppNotificationsController {
  constructor(private readonly service: InAppNotificationsService) {}

  @Get()
  list(@Req() req: { user: { id: string; role: string } }, @Query('unread') unread?: string) {
    return this.service.list({ userId: req.user.id, role: req.user.role }, unread === 'true');
  }

  @Patch(':id/read')
  read(@Param('id') id: string, @Req() req: { user: { id: string; role: string } }) {
    return this.service.markRead(id, { userId: req.user.id, role: req.user.role });
  }

  // Cookie (vía proxy del panel) o `?token=` de POST /realtime/stream-token
  // (EventSource directo al backend).
  @Sse('stream')
  @AllowSseToken()
  stream(@Req() req: { user: { id: string; role: string } }): Observable<SseMessage> {
    return withSseHeartbeat(
      this.service.stream({ userId: req.user.id, role: req.user.role }).pipe(map((event) => ({ data: event }))),
    );
  }
}

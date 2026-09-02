import { Controller, Get, Param, Patch, Query, Req, Sse, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { map, Observable } from 'rxjs';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { InAppNotificationsService } from './in-app-notifications.service';

@ApiTags('Notificaciones del panel')
@Controller('in-app-notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class InAppNotificationsController {
  constructor(private readonly service: InAppNotificationsService) {}

  @Get()
  list(@Req() req: { user: { id: string } }, @Query('unread') unread?: string) {
    return this.service.list(req.user.id, unread === 'true');
  }

  @Patch(':id/read')
  read(@Param('id') id: string, @Req() req: { user: { id: string } }) {
    return this.service.markRead(id, req.user.id);
  }

  @Sse('stream')
  stream(): Observable<{ data: unknown }> {
    return this.service.stream().pipe(map((event) => ({ data: event })));
  }
}

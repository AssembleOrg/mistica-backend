import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AllowedViews } from '../common/decorators';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { AllowedViewsGuard } from '../common/guards/allowed-views.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateKilnLogDto, ListKilnLogsDto } from './kilns.dto';
import { KilnsService } from './kilns.service';

interface AuthRequest extends Request {
  user?: { id: string; role?: string };
}

@ApiTags('Hornos')
@Controller('kilns')
@UseGuards(JwtAuthGuard, RolesGuard, AllowedViewsGuard)
@ApiBearerAuth()
@AllowedViews('reservas:piezas', 'produccion')
export class KilnsController {
  constructor(private readonly service: KilnsService) {}

  @Get('status')
  @ApiOperation({ summary: 'Estado de cada horno (último movimiento)' })
  status() {
    return this.service.status();
  }

  @Get('logs')
  @ApiOperation({ summary: 'Movimientos de los hornos entre dos días' })
  list(@Query() q: ListKilnLogsDto) {
    return this.service.list(q.from, q.to);
  }

  @Post('logs')
  @ApiOperation({ summary: 'Registrar que se prendió o se apagó y descargó un horno' })
  create(@Body() dto: CreateKilnLogDto, @Req() req: AuthRequest) {
    return this.service.create(dto, req.user);
  }

  @Delete('logs/:id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Borrar un registro cargado por error' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

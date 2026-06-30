import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public, Throttle } from '../common/decorators';
import { SimpleThrottleGuard } from '../common/guards/simple-throttle.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateClosedDateDto } from '../common/dto/closed-date.dto';
import { UserRole } from '../common/enums/user-role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ClosedDatesService } from './closed-dates.service';

@ApiTags('Días cerrados')
@Controller('closed-dates')
@UseGuards(SimpleThrottleGuard)
export class ClosedDatesController {
  constructor(private readonly service: ClosedDatesService) {}

  // ── Público: lo consume el bot (y la web) para avisar días sin atención ──
  @Get('public')
  @Public()
  @Throttle(30, 60)
  @ApiOperation({ summary: 'Días/reglas de cierre (público, para bot/web)' })
  async publicList() {
    return this.service.describePublic();
  }

  // ── Admin ──
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crear día/regla de cierre (admin)' })
  async create(@Body() dto: CreateClosedDateDto) {
    return this.service.create(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar días/reglas de cierre (admin)' })
  async list() {
    return this.service.list();
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Eliminar día/regla de cierre (admin)' })
  async remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

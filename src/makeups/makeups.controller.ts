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
import {
  ListMakeupsQueryDto,
  ScheduleMakeupDto,
} from '../common/dto/makeup.dto';
import { AllowedViews } from '../common/decorators';
import { AllowedViewsGuard } from '../common/guards/allowed-views.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { MakeupsService } from './makeups.service';

interface AuthRequest extends Request {
  user?: { id?: string; role?: string };
}

/** Recuperaciones de clases del taller: quién falta y dónde la recupera. */
@ApiTags('Recuperaciones')
@Controller('makeups')
@UseGuards(JwtAuthGuard, AllowedViewsGuard)
@ApiBearerAuth()
@AllowedViews('alumnos')
export class MakeupsController {
  constructor(private readonly service: MakeupsService) {}

  @Get()
  @ApiOperation({
    summary: 'Recuperaciones de una clase (grupo + día) o de un alumno',
  })
  list(@Query() query: ListMakeupsQueryDto) {
    return this.service.list(query);
  }

  @Post()
  @ApiOperation({
    summary: 'Agendar (o cambiar) en qué clase recupera un alumno la que falta',
  })
  schedule(@Body() dto: ScheduleMakeupDto, @Req() req: AuthRequest) {
    return this.service.schedule(dto, req.user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Cancelar una recuperación' })
  cancel(@Param('id') id: string) {
    return this.service.cancel(id);
  }
}

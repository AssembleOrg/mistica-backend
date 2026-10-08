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
  ListExtraClassesQueryDto,
  ScheduleExtraClassDto,
} from '../common/dto/makeup.dto';
import { AllowedViews } from '../common/decorators';
import { AllowedViewsGuard } from '../common/guards/allowed-views.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ExtraClassesService } from './extra-classes.service';

interface AuthRequest extends Request {
  user?: { id?: string; role?: string };
}

/** Clases extra del taller: un alumno suma una clase de otro grupo. */
@ApiTags('Clases extra')
@Controller('extra-classes')
@UseGuards(JwtAuthGuard, AllowedViewsGuard)
@ApiBearerAuth()
@AllowedViews('alumnos')
export class ExtraClassesController {
  constructor(private readonly service: ExtraClassesService) {}

  @Get()
  @ApiOperation({ summary: 'Clases extra de una clase (grupo + día) o de un alumno' })
  list(@Query() query: ListExtraClassesQueryDto) {
    return this.service.list(query);
  }

  @Post()
  @ApiOperation({ summary: 'Sumar a un alumno a una clase extra' })
  schedule(@Body() dto: ScheduleExtraClassDto, @Req() req: AuthRequest) {
    return this.service.schedule(dto, req.user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Quitar una clase extra' })
  cancel(@Param('id') id: string) {
    return this.service.cancel(id);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AllowedViews } from '../common/decorators';
import { AllowedViewsGuard } from '../common/guards/allowed-views.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  CreateKitchenProductionDto,
  ListKitchenProductionDto,
  UpdateKitchenProductionDto,
} from './kitchen-production.dto';
import { KitchenProductionService } from './kitchen-production.service';

interface AuthRequest extends Request {
  user?: { id: string; role?: string };
}

@ApiTags('Producción de cocina')
@Controller('kitchen-production')
@UseGuards(JwtAuthGuard, RolesGuard, AllowedViewsGuard)
@ApiBearerAuth()
@AllowedViews('reservas:cocina')
export class KitchenProductionController {
  constructor(private readonly service: KitchenProductionService) {}

  @Get()
  @ApiOperation({ summary: 'Producción de cocina entre dos días' })
  list(@Query() q: ListKitchenProductionDto) {
    return this.service.list(q.from, q.to, q.reservationId);
  }

  @Get('suggestions')
  @ApiOperation({ summary: 'Lo que más se anota (para sugerir al cargar)' })
  suggestions() {
    return this.service.suggestions();
  }

  @Post()
  @ApiOperation({ summary: 'Anotar algo que preparó cocina' })
  create(@Body() dto: CreateKitchenProductionDto, @Req() req: AuthRequest) {
    return this.service.create(dto, req.user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Corregir un registro' })
  update(@Param('id') id: string, @Body() dto: UpdateKitchenProductionDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Borrar un registro cargado por error' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

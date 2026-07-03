import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PiecesService } from './pieces.service';
import {
  CreatePieceDto,
  UpdatePieceDto,
  ListPiecesQueryDto,
} from '../common/dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Public } from '../common/decorators';
import { envConfig } from '../config/env.config';

@ApiTags('Piezas')
@Controller('pieces')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PiecesController {
  constructor(private readonly piecesService: PiecesService) {}

  // Uso INTERNO del bot: piezas del cliente por su propio teléfono. Mismo
  // secreto compartido bot↔backend. Va ANTES de las rutas admin.
  @Get('by-phone')
  @Public()
  @ApiOperation({ summary: 'Piezas del cliente por teléfono (interno del bot)' })
  async byPhone(
    @Query('phone') phone: string,
    @Headers('x-bot-secret') secret?: string,
  ) {
    const expected = envConfig.botControl.secret;
    if (!expected || secret !== expected) {
      throw new UnauthorizedException('No autorizado');
    }
    return this.piecesService.byPhone(phone || '');
  }

  @Post()
  @ApiOperation({ summary: 'Crear una pieza (admin)' })
  create(@Body() dto: CreatePieceDto) {
    return this.piecesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar piezas (admin)' })
  list(@Query() query: ListPiecesQueryDto) {
    return this.piecesService.list(query);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar / avanzar estado de una pieza (admin)' })
  update(@Param('id') id: string, @Body() dto: UpdatePieceDto) {
    return this.piecesService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar (soft) una pieza (admin)' })
  remove(@Param('id') id: string) {
    return this.piecesService.remove(id);
  }
}

import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { CreditNotesService } from './credit-notes.service';
import { IssueCreditNoteDto } from '../common/dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

interface AuthRequest extends Request {
  user?: { id: string };
}

@ApiTags('Notas de Crédito')
@Controller()
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CreditNotesController {
  constructor(private readonly cnService: CreditNotesService) {}

  @Post('sales/:saleId/credit-notes')
  @ApiOperation({
    summary:
      'Emitir nota de crédito para una venta. amount opcional (default = total venta).',
  })
  @ApiResponse({ status: 201, description: 'NC creada' })
  async issue(
    @Param('saleId') saleId: string,
    @Body() dto: IssueCreditNoteDto,
    @Req() req: AuthRequest,
  ) {
    return this.cnService.issueForSale(saleId, dto, req.user?.id);
  }

  @Get('sales/:saleId/credit-notes')
  @ApiOperation({ summary: 'Listar NCs de una venta' })
  async findBySale(@Param('saleId') saleId: string) {
    return this.cnService.findBySale(saleId);
  }

  @Get('credit-notes')
  @ApiOperation({ summary: 'Listar todas las NCs' })
  async findAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.cnService.findAll(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  @Get('credit-notes/:id')
  @ApiOperation({ summary: 'Detalle de una NC' })
  async findOne(@Param('id') id: string) {
    return this.cnService.findOne(id);
  }
}

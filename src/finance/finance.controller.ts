import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FinanceService } from './finance.service';
import { FinanceSummaryQueryDto } from '../common/dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('Finanzas')
@Controller('finance')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Resumen contable del rango con filtros (ventas, pagos, gastos, caja)',
  })
  async summary(@Query() query: FinanceSummaryQueryDto) {
    return this.financeService.summary(query);
  }
}

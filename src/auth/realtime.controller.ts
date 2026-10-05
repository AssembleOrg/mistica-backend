import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthService } from './auth.service';

@ApiTags('Autenticación')
@Controller('realtime')
@UseGuards(JwtAuthGuard)
export class RealtimeController {
  constructor(private readonly authService: AuthService) {}

  @Post('stream-token')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Token corto (90 s) para abrir los streams SSE directo contra el backend (?token=)',
  })
  @ApiResponse({ status: 200, description: '{ token, expiresIn } (segundos)' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  streamToken(@Req() req: { user: { id: string } }) {
    return this.authService.issueStreamToken(req.user.id);
  }
}

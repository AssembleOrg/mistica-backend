import {
  Body,
  Controller,
  Delete,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { UploadsService } from './uploads.service';

/**
 * Carga de imágenes a DigitalOcean Spaces. Cualquier cuenta autenticada puede
 * subir (los profesores cargan fotos de piezas desde el celular); borrar del
 * bucket es del admin. La URL devuelta se pega en el campo que corresponda.
 */
@ApiTags('Imágenes')
@Controller('uploads')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UploadsController {
  constructor(private readonly service: UploadsService) {}

  @Post('image')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024 }, // fotos de celular actuales
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Subir una imagen (se convierte a WebP)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        image: { type: 'string', format: 'binary' },
        folder: {
          type: 'string',
          description: "Carpeta: 'piezas', 'experiencias' o 'general'",
        },
      },
    },
  })
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('folder') folder?: string,
  ) {
    return this.service.uploadImage(file, folder);
  }

  @Delete('image')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Borrar una imagen del bucket (por key)' })
  remove(@Query('key') key: string) {
    return this.service.deleteImage(key || '');
  }
}
